import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

import SpriteInfoComponent from '../components/sprite-info/sprite-info.jsx';

import { ablyInstance, ablySpace } from '../utils/AblyHandlers.jsx';

const ablyChannel = ablyInstance.channels.get(ablySpace);

class SpriteInfo extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickVisible',
            'handleClickNotVisible'
        ]);
        ablyChannel.subscribe('changeVisibility', (message) => {
            this.props.onChangeVisibility(JSON.parse(message.data));
        })
    }
    handleClickVisible (e) {
        e.preventDefault();
        ablyChannel.publish('changeVisibility', JSON.stringify(true));
    }
    handleClickNotVisible (e) {
        e.preventDefault();
        ablyChannel.publish('changeVisibility', JSON.stringify(false));
    }
    render () {
        return (
            <SpriteInfoComponent
                {...this.props}
                onClickNotVisible={this.handleClickNotVisible}
                onClickVisible={this.handleClickVisible}
            />
        );
    }
}

SpriteInfo.propTypes = {
    ...SpriteInfoComponent.propTypes,
    onChangeDirection: PropTypes.func,
    onChangeName: PropTypes.func,
    onChangeSize: PropTypes.func,
    onChangeVisibility: PropTypes.func,
    onChangeX: PropTypes.func,
    onChangeY: PropTypes.func,
    x: PropTypes.number,
    y: PropTypes.number
};

export default SpriteInfo;
