import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import React from 'react';

import {getVersionOffset, setVersionOffset, subscribeVersionOffset} from '../../utils/versionOffset.js';
import {
    getBuffering,
    getCurrentVersion,
    getLoadError,
    getOldestOffset,
    jumpToDate,
    peekVersion,
    subscribeVersionHistory
} from '../../utils/versionHistory.js';

import styles from './menu-bar.css';

// A load straight out of the cache finishes about this fast, so the notice waits
// this long before showing to avoid flashing on every step.
const BUFFERING_NOTICE_DELAY_MS = 200;

const formatTime = time => new Date(time).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
});

// <input type="datetime-local"> takes local time as YYYY-MM-DDTHH:mm.
const toDateTimeLocal = date => {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const describeOffset = offset => (offset === 0 ? 'the current version' : `${offset} back`);

// "Oct 12, 2:14 PM by Ryon", or null when the lambda didn't report a time.
const describeSave = version => {
    if (!version || !version.lastModified) {
        return null;
    }
    return formatTime(version.lastModified) + (version.author ? ` by ${version.author}` : '');
};

const stepTitle = (label, payload) => {
    const save = describeSave(payload);
    return save ? `${label} (saved ${save})` : label;
};

const describeBuffering = buffering => {
    if (buffering.stage === 'searching') {
        return `Finding the version from ${formatTime(buffering.at)}…`;
    }
    if (buffering.stage === 'fetching') {
        return `Buffering ${describeOffset(buffering.offset)}…`;
    }
    return `Loading ${describeOffset(buffering.offset)}…`;
};

/**
 * Version history controls for the menu bar: step one save back or forward, jump to
 * a date, and see when and by whom the version on screen was saved.
 */
class VersionHistory extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickOlder',
            'handleClickNewer',
            'handleTogglePicker',
            'handlePickerChange',
            'handlePickerSubmit',
            'handleClickLatest',
            'handleDocumentMouseDown',
            'handleHistoryChange',
            'setContainerRef'
        ]);
        this.state = {
            versionOffset: getVersionOffset(),
            currentVersion: getCurrentVersion(),
            buffering: getBuffering(),
            loadError: getLoadError(),
            showBufferingNotice: false,
            pickerOpen: false,
            pickerValue: '',
            pickerError: null
        };
        this.noticeTimeout = null;
    }
    componentDidMount () {
        // Blocks can clamp the offset when the history runs out, so mirror the shared
        // value rather than tracking our own copy of it.
        this.unsubscribeOffset = subscribeVersionOffset(
            versionOffset => this.setState({versionOffset})
        );
        this.unsubscribeHistory = subscribeVersionHistory(this.handleHistoryChange);
        document.addEventListener('mousedown', this.handleDocumentMouseDown);
    }
    componentWillUnmount () {
        this.unsubscribeOffset();
        this.unsubscribeHistory();
        document.removeEventListener('mousedown', this.handleDocumentMouseDown);
        clearTimeout(this.noticeTimeout);
    }
    handleHistoryChange () {
        const buffering = getBuffering();
        this.setState({currentVersion: getCurrentVersion(), buffering, loadError: getLoadError()});
        if (!buffering) {
            clearTimeout(this.noticeTimeout);
            this.noticeTimeout = null;
            this.setState({showBufferingNotice: false});
        } else if (!this.noticeTimeout && !this.state.showBufferingNotice) {
            this.noticeTimeout = setTimeout(() => {
                this.noticeTimeout = null;
                if (getBuffering()) {
                    this.setState({showBufferingNotice: true});
                }
            }, BUFFERING_NOTICE_DELAY_MS);
        }
    }
    handleClickOlder () {
        setVersionOffset(getVersionOffset() + 1);
    }
    handleClickNewer () {
        setVersionOffset(getVersionOffset() - 1);
    }
    handleTogglePicker () {
        if (this.state.pickerOpen) {
            this.setState({pickerOpen: false});
            return;
        }
        const version = this.state.currentVersion;
        const start = version && version.lastModified ? new Date(version.lastModified) : new Date();
        this.setState({
            pickerOpen: true,
            pickerValue: toDateTimeLocal(start),
            pickerError: null
        });
    }
    handlePickerChange (e) {
        this.setState({pickerValue: e.target.value, pickerError: null});
    }
    async handlePickerSubmit (e) {
        e.preventDefault();
        const at = new Date(this.state.pickerValue).getTime();
        if (!Number.isFinite(at)) {
            this.setState({pickerError: 'Pick a date and time.'});
            return;
        }
        this.setState({pickerOpen: false});
        try {
            await jumpToDate(at);
        } catch (error) {
            this.setState({pickerOpen: true, pickerError: error.message});
        }
    }
    handleClickLatest () {
        this.setState({pickerOpen: false});
        setVersionOffset(0);
    }
    handleDocumentMouseDown (e) {
        if (this.state.pickerOpen && this.container && !this.container.contains(e.target)) {
            this.setState({pickerOpen: false});
        }
    }
    setContainerRef (element) {
        this.container = element;
    }
    render () {
        const {versionOffset, currentVersion, buffering, loadError} = this.state;
        const showBuffering = this.state.showBufferingNotice && buffering;
        const oldestOffset = getOldestOffset();
        const onScreen = currentVersion && currentVersion.offset === versionOffset ? currentVersion : null;
        const save = describeSave(onScreen);

        return (
            <div
                className={classNames(styles.menuBarItem, styles.versionOffset)}
                ref={this.setContainerRef}
            >
                <button
                    aria-label="Go one version back"
                    className={styles.versionOffsetButton}
                    disabled={oldestOffset !== null && versionOffset >= oldestOffset}
                    title={stepTitle('Go one version back', peekVersion(versionOffset + 1))}
                    onClick={this.handleClickOlder}
                >
                    {'◀'}
                </button>
                <div
                    className={styles.versionOffsetLabel}
                    title={onScreen && onScreen.lastModified ?
                        new Date(onScreen.lastModified).toLocaleString() :
                        null}
                >
                    <span>{versionOffset === 0 ? 'Current' : `${versionOffset} back`}</span>
                    {(save || buffering) && (
                        <span className={styles.versionOffsetMeta}>
                            {save || 'Loading…'}
                        </span>
                    )}
                </div>
                <button
                    aria-label="Go one version forward"
                    className={styles.versionOffsetButton}
                    disabled={versionOffset === 0}
                    title={versionOffset === 0 ?
                        'Go one version forward' :
                        stepTitle('Go one version forward', peekVersion(versionOffset - 1))}
                    onClick={this.handleClickNewer}
                >
                    {'▶'}
                </button>
                <button
                    aria-expanded={this.state.pickerOpen}
                    aria-label="Jump to a date"
                    className={styles.versionOffsetButton}
                    title="Jump to a date"
                    onClick={this.handleTogglePicker}
                >
                    {'📅'}
                </button>
                {this.state.pickerOpen && (
                    <form
                        className={styles.versionPicker}
                        onSubmit={this.handlePickerSubmit}
                    >
                        <label className={styles.versionPickerLabel}>
                            {'Show the project as it was at'}
                            <input
                                className={styles.versionPickerInput}
                                max={toDateTimeLocal(new Date())}
                                type="datetime-local"
                                value={this.state.pickerValue}
                                onChange={this.handlePickerChange}
                            />
                        </label>
                        {this.state.pickerError && (
                            <div className={styles.versionPickerError}>{this.state.pickerError}</div>
                        )}
                        <div className={styles.versionPickerActions}>
                            <button
                                className={styles.versionPickerSecondary}
                                type="button"
                                onClick={this.handleClickLatest}
                            >
                                {'Back to current'}
                            </button>
                            <button
                                className={styles.versionPickerPrimary}
                                type="submit"
                            >
                                {'Go'}
                            </button>
                        </div>
                    </form>
                )}
                {showBuffering && (
                    <div
                        aria-live="polite"
                        className={styles.bufferingNotice}
                        role="status"
                    >
                        <span className={styles.bufferingSpinner} />
                        {describeBuffering(buffering)}
                    </div>
                )}
                {loadError && !showBuffering && (
                    <div
                        className={classNames(styles.bufferingNotice, styles.bufferingNoticeError)}
                        role="alert"
                    >
                        {loadError}
                    </div>
                )}
            </div>
        );
    }
}

export default VersionHistory;
