import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import LibraryItem from '../../containers/library-item.jsx';
import Modal from '../../containers/modal.jsx';
import Divider from '../divider/divider.jsx';
import Filter from '../filter/filter.jsx';
import TagButton from '../../containers/tag-button.jsx';
import Spinner from '../spinner/spinner.jsx';

import styles from './library.css';

const messages = defineMessages({
    filterPlaceholder: {
        id: 'gui.library.filterPlaceholder',
        defaultMessage: 'Search',
        description: 'Placeholder text for library search field'
    },
    allTag: {
        id: 'gui.library.allTag',
        defaultMessage: 'All',
        description: 'Label for library tag to revert to all items after filtering by tag.'
    }
});


const ALL_TAG = {tag: 'all', intlLabel: messages.allTag};
const tagListPrefix = [ALL_TAG];

class LibraryComponent extends React.Component {
    static costumeIdsToData = [];

    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClose',
            'handleFilterChange',
            'handleFilterClear',
            'handleMouseEnter',
            'handleMouseLeave',
            'handlePlayingEnd',
            'handleSelect',
            'handleTagClick',
            'setFilteredDataRef'
        ]);
        this.state = {
            playingItem: null,
            filterQuery: '',
            selectedTag: ALL_TAG.tag,
            loaded: false
        };
    }
    componentDidMount () {
        // Allow the spinner to display before loading the content
        setTimeout(() => {
            this.setState({loaded: true});
        });
        if (this.props.setStopHandler) this.props.setStopHandler(this.handlePlayingEnd);
        //console.log(JSON.stringify(this.getFilteredData()));
    }
    componentDidUpdate (prevProps, prevState) {
        if (prevState.filterQuery !== this.state.filterQuery ||
            prevState.selectedTag !== this.state.selectedTag) {
            this.scrollToTop();
        }
    }
    handleSelect (id) {
        this.handleClose();
        this.props.onItemSelected(this.getFilteredData()[id]);
        // this.handleClose();
        // selectItemWithFunc(this.props.onItemSelected, id);
        // this.props.onItemSelected(this.getFilteredData()[id]);
    }
    static selectItemWithFunc(func, id) {
        CostumeLibrary.handleItemSelectedWithVM(this.props.vm, func(id));
    }
    handleClose () {
        this.props.onRequestClose();
    }
    handleTagClick (tag) {
        if (this.state.playingItem === null) {
            this.setState({
                filterQuery: '',
                selectedTag: tag.toLowerCase()
            });
        } else {
            this.props.onItemMouseLeave(this.getFilteredData()[[this.state.playingItem]]);
            this.setState({
                filterQuery: '',
                playingItem: null,
                selectedTag: tag.toLowerCase()
            });
        }
    }
    handleMouseEnter (id) {
        // don't restart if mouse over already playing item
        if (this.props.onItemMouseEnter && this.state.playingItem !== id) {
            this.props.onItemMouseEnter(this.getFilteredData()[id]);
            this.setState({
                playingItem: id
            });
        }
    }
    handleMouseLeave (id) {
        if (this.props.onItemMouseLeave) {
            this.props.onItemMouseLeave(this.getFilteredData()[id]);
            this.setState({
                playingItem: null
            });
        }
    }
    handlePlayingEnd () {
        if (this.state.playingItem !== null) {
            this.setState({
                playingItem: null
            });
        }
    }
    handleFilterChange (event) {
        if (this.state.playingItem === null) {
            this.setState({
                filterQuery: event.target.value,
                selectedTag: ALL_TAG.tag
            });
        } else {
            this.props.onItemMouseLeave(this.getFilteredData()[[this.state.playingItem]]);
            this.setState({
                filterQuery: event.target.value,
                playingItem: null,
                selectedTag: ALL_TAG.tag
            });
        }
    }
    handleFilterClear () {
        this.setState({filterQuery: ''});
    }
    async fetchAndUploadFile(md5, imageUrl, uploadApiUrl) {
        try {
            // Determine the file extension
            const extension = md5.split('.').pop().toLowerCase();
            
            // Fetch the file from the API
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch file. Status code: ${response.status}`);
            }
            
            let fileContent;
            let contentType;

            // Get the file content and determine content type
            if (extension === 'svg') {
                fileContent = await response.text();
                contentType = 'image/svg+xml';
            } else if (extension === 'png') {
                fileContent = await response.blob();
                contentType = 'image/png';
            
                const arrayBuffer = await fileContent.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                let binaryString = '';
                for (let i = 0; i < uint8Array.length; i++) {
                    binaryString += String.fromCharCode(uint8Array[i]);
                }
                fileContent = btoa(binaryString);
            } else {
                throw new Error('Unsupported file type');
            }
            
            console.log("ext", extension, 'data', fileContent)
            
            // Upload the file to the upload API
            const uploadResponse = await fetch(uploadApiUrl + "&cd=attachment", {
                method: 'POST',
                headers: {
                    'Accept': '*/*',
                    'Connection': 'keep-alive',
                    'Content-Type': contentType,
                    'Content-Disposition': 'attachment',
                },
                body: fileContent,
            });
            
            if (!uploadResponse.ok) {
                throw new Error(`Failed to upload file. Status code: ${uploadResponse.status}`);
            }
            
            const responseBody = await uploadResponse.text();
            console.log('Upload API response:', responseBody, uploadResponse);
        } catch (error) {
            console.error('Error:', error);
        }
    }
    async fetchAndUploadWAV (fileUrl, uploadApiUrl) {
        try {
            // Fetch the WAV file from the API
            const response = await fetch(fileUrl);
            console.log("rha", fileUrl, response)
            if (!response.ok) {
                throw new Error(`Failed to fetch file. Status code: ${response.status}`);
            }
        
            // Get the WAV content as a Buffer
            const arrayBuffer = await response.arrayBuffer();
            // const wavBuffer = new Uint8Array(arrayBuffer); 
            const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
            
            // Upload the WAV to the upload API
            const uploadResponse = await fetch(uploadApiUrl + "&cd=attachment", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                },
                body: JSON.stringify({ file: base64String }),
            });
        
            if (!uploadResponse.ok) {
                throw new Error(`Failed to upload file. Status code: ${uploadResponse.status}`);
            }
        
            const responseBody = await uploadResponse.text();
            console.log('Upload API response:', responseBody);
        } catch (error) {
            console.error('Error:', error);
        }
    };
    async uploadFiles() {
        let costumes = []
        console.log(this.props.data)
        for (const costume of this.props.data) {
            try {
                await this.fetchAndUploadWAV(
                    // costume._md5,
                    `https://cdn.assets.scratch.mit.edu/internalapi/asset/${costume._md5}/get/`,
                    "https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/images?fileName="+costume._md5
                )
            } catch (error) {
                console.error('Error:', error);
                return
            }
        }
        return
        const res2 = fetch("https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/assetID",{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(costumes)
        })
    }
    getFilteredData () {
        // this.uploadFiles();
        if (this.state.selectedTag === 'all') {
            if (!this.state.filterQuery) return this.props.data;
            return this.props.data.filter(dataItem => (
                (dataItem.tags || [])
                    // Second argument to map sets `this`
                    .map(String.prototype.toLowerCase.call, String.prototype.toLowerCase)
                    .concat(dataItem.name ?
                        (typeof dataItem.name === 'string' ?
                        // Use the name if it is a string, else use formatMessage to get the translated name
                            dataItem.name : this.props.intl.formatMessage(dataItem.name.props)
                        ).toLowerCase() :
                        null)
                    .join('\n') // unlikely to partially match newlines
                    .indexOf(this.state.filterQuery.toLowerCase()) !== -1
            ));
        }
        LibraryComponent.costumeIdsToData = this.props.data.filter(dataItem => (
            dataItem.tags &&
            dataItem.tags
                .map(String.prototype.toLowerCase.call, String.prototype.toLowerCase)
                .indexOf(this.state.selectedTag) !== -1
        ));
        return LibraryComponent.costumeIdsToData;
    }
    scrollToTop () {
        this.filteredDataRef.scrollTop = 0;
    }
    setFilteredDataRef (ref) {
        this.filteredDataRef = ref;
    }
    render () {
        //console.log( JSON.stringify(this.getFilteredData()[3]))
        return (
            <Modal
                fullScreen
                contentLabel={this.props.title}
                id={this.props.id}
                onRequestClose={this.handleClose}
            >
                {(this.props.filterable || this.props.tags) && (
                    <div className={styles.filterBar}>
                        {this.props.filterable && (
                            <Filter
                                className={classNames(
                                    styles.filterBarItem,
                                    styles.filter
                                )}
                                filterQuery={this.state.filterQuery}
                                inputClassName={styles.filterInput}
                                placeholderText={this.props.intl.formatMessage(messages.filterPlaceholder)}
                                onChange={this.handleFilterChange}
                                onClear={this.handleFilterClear}
                            />
                        )}
                        {this.props.filterable && this.props.tags && (
                            <Divider className={classNames(styles.filterBarItem, styles.divider)} />
                        )}
                        {this.props.tags &&
                            <div className={styles.tagWrapper}>
                                {tagListPrefix.concat(this.props.tags).map((tagProps, id) => (
                                    <TagButton
                                        active={this.state.selectedTag === tagProps.tag.toLowerCase()}
                                        className={classNames(
                                            styles.filterBarItem,
                                            styles.tagButton,
                                            tagProps.className
                                        )}
                                        key={`tag-button-${id}`}
                                        onClick={this.handleTagClick}
                                        {...tagProps}
                                    />
                                ))}
                            </div>
                        }
                    </div>
                )}
                <div
                    className={classNames(styles.libraryScrollGrid, {
                        [styles.withFilterBar]: this.props.filterable || this.props.tags
                    })}
                    ref={this.setFilteredDataRef}
                >
                    {this.state.loaded ? this.getFilteredData().map((dataItem, index) => (
                        <LibraryItem
                            bluetoothRequired={dataItem.bluetoothRequired}
                            collaborator={dataItem.collaborator}
                            description={dataItem.description}
                            disabled={dataItem.disabled}
                            extensionId={dataItem.extensionId}
                            featured={dataItem.featured}
                            hidden={dataItem.hidden}
                            iconMd5={dataItem.costumes ? dataItem.costumes[0].md5ext : dataItem.md5ext}
                            iconRawURL={dataItem.rawURL}
                            icons={dataItem.costumes}
                            id={index}
                            insetIconURL={dataItem.insetIconURL}
                            internetConnectionRequired={dataItem.internetConnectionRequired}
                            isPlaying={this.state.playingItem === index}
                            key={typeof dataItem.name === 'string' ? dataItem.name : dataItem.rawURL}
                            name={dataItem.name}
                            showPlayButton={this.props.showPlayButton}
                            onMouseEnter={this.handleMouseEnter}
                            onMouseLeave={this.handleMouseLeave}
                            onSelect={this.handleSelect}
                            parent={this}
                        />
                    )) : (
                        <div className={styles.spinnerWrapper}>
                            <Spinner
                                large
                                level="primary"
                            />
                        </div>
                    )}
                </div>
            </Modal>
        );
    }
}

LibraryComponent.propTypes = {
    data: PropTypes.arrayOf(
        /* eslint-disable react/no-unused-prop-types, lines-around-comment */
        // An item in the library
        PropTypes.shape({
            // @todo remove md5/rawURL prop from library, refactor to use storage
            md5: PropTypes.string,
            name: PropTypes.oneOfType([
                PropTypes.string,
                PropTypes.node
            ]),
            rawURL: PropTypes.string
        })
        /* eslint-enable react/no-unused-prop-types, lines-around-comment */
    ),
    filterable: PropTypes.bool,
    id: PropTypes.string.isRequired,
    intl: intlShape.isRequired,
    onItemMouseEnter: PropTypes.func,
    onItemMouseLeave: PropTypes.func,
    onItemSelected: PropTypes.func,
    onRequestClose: PropTypes.func,
    setStopHandler: PropTypes.func,
    showPlayButton: PropTypes.bool,
    tags: PropTypes.arrayOf(PropTypes.shape(TagButton.propTypes)),
    title: PropTypes.string.isRequired
};

LibraryComponent.defaultProps = {
    filterable: true,
    showPlayButton: false
};

export default injectIntl(LibraryComponent);
