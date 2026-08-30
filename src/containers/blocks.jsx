import bindAll from 'lodash.bindall';
import debounce from 'lodash.debounce';
import defaultsDeep from 'lodash.defaultsdeep';
import makeToolboxXML from '../lib/make-toolbox-xml';
import PropTypes from 'prop-types';
import React, { useRef } from 'react';
import VMScratchBlocks from '../lib/blocks';
import VM from 'scratch-vm';

import log from '../lib/log.js';
import Prompt from './prompt.jsx';
import BlocksComponent from '../components/blocks/blocks.jsx';
import ExtensionLibrary from './extension-library.jsx';
import extensionData from '../lib/libraries/extensions/index.jsx';
import CustomProcedures from './custom-procedures.jsx';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import dataURItoBlob from '../lib/data-uri-to-blob';
import {BLOCKS_DEFAULT_SCALE, STAGE_DISPLAY_SIZES} from '../lib/layout-constants';
import DropAreaHOC from '../lib/drop-area-hoc.jsx';
import DragConstants from '../lib/drag-constants';
import defineDynamicBlock from '../lib/define-dynamic-block';
import {DEFAULT_THEME, getColorsForTheme, themeMap} from '../lib/themes';
import {injectExtensionBlockTheme, injectExtensionCategoryTheme} from '../lib/themes/blockHelpers';

import {connect} from 'react-redux';
import {updateToolbox} from '../reducers/toolbox';
import {activateColorPicker} from '../reducers/color-picker';
import {closeExtensionLibrary, openSoundRecorder, openConnectionModal} from '../reducers/modals';
import {activateCustomProcedures, deactivateCustomProcedures} from '../reducers/custom-procedures';
import {setConnectionModalExtensionId} from '../reducers/connection-modal';
import {updateMetrics} from '../reducers/workspace-metrics';
import {isTimeTravel2020} from '../reducers/time-travel';
import {Realtime} from "ably";
import Ably from 'ably';
import { AblyProvider, useChannel, usePresence } from 'ably/react';
import {nanoid} from 'nanoid';
import {inSpace, ablySpace, ablyInstance, name} from "../utils/AblyHandlers.jsx";
import {getVersionOffset, setVersionOffset, subscribeVersionOffset} from "../utils/versionOffset.js";
import s3 from '../utils/S3DataFetcher.jsx';
import AWS from 'aws-sdk';
//import s3Client from "@aws-sdk/client-s3";

import {
    activateTab,
    SOUNDS_TAB_INDEX
} from '../reducers/editor-tab';
import { c } from 'bowser';
import { serializeHost } from 'scratch-storage';
import LibraryComponent from '../components/library/library.jsx';

let isTimeToSave = false;
setInterval(() => {isTimeToSave = true;}, 6000); 

const addFunctionListener = (object, property, callback) => {
    const oldFn = object[property];
    object[property] = function (...args) {
        const result = oldFn.apply(this, args);
        callback.apply(this, result);
        return result;
    };
};

const DroppableBlocks = DropAreaHOC([
    DragConstants.BACKPACK_CODE
])(BlocksComponent);

/*
const { connectionError, channelError } = useChannel({ channelName: 'blocks' }, (message) => {
    console.log("what the fuck")
    console.log(message);
});
*/

//const fs = require('fs');

const uname = name
const s3Client = new AWS.S3();
const nid = nanoid();
const ably = ablyInstance;
const innerChannelName = ablySpace && ablySpace.endsWith('_inner') ? ablySpace : `${ablySpace}_inner`;
var channel = ably.channels.get(ablySpace);
let hasInited = false;
let flag1 = false;
let flag2 = false;

const S3_STORAGE_URL = "https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/s3-storage";

let stopEmission = false;



class Blocks extends React.Component {
    
    constructor (props) {

        super(props);
        
        sessionStorage.setItem("dragRelative", JSON.stringify({x: 0, y: 0}));
        this.ScratchBlocks = VMScratchBlocks(props.vm, false);

        // MARKER
        // const ogUpdateScroll = this.ScratchBlocks.WorkspaceDragger.prototype.updateScroll_;

        // this.ScratchBlocks.WorkspaceDragger.prototype.updateScroll_ = function (x,y) {
        //     //console.log(x, y)
        //     //console.log( this.ScratchBlocks.WorkspaceDragger.prototype.handlePosition_ )
        //     console.log(this.workspace)
        //     setDragRelative({x: x, y: y});
        //     ogUpdateScroll.call(this, x, y);
        // }.bind(this)

        // const ogWorkspaceDragger = this.ScratchBlocks.WorkspaceDragger.bind(this.ScratchBlocks)
        // this.ScratchBlocks.WorkspaceDragger = function(workspace) {
        //     console.log("THIS IS WORKSPACE DRAGGER", workspace)
        //     ogWorkspaceDragger(workspace);
        // }.bind(this.ScratchBlocks)

        bindAll(this, [
            'attachVM',
            'detachVM',
            'getToolboxXML',
            'handleParentMessage',
            'handleRemoteHighlightMessage',
            'resolveBlockIdForHighlight',
            'handleCategorySelected',
            'handleConnectionModalStart',
            'handleDrop',
            'handleStatusButtonUpdate',
            'handleOpenSoundRecorder',
            'handlePromptStart',
            'handlePromptCallback',
            'handlePromptClose',
            'handleCustomProceduresClose',
            'onScriptGlowOn',
            'onScriptGlowOff',
            'onBlockGlowOn',
            'onBlockGlowOff',
            'handleMonitorsUpdate',
            'handleExtensionAdded',
            'handleBlocksInfoUpdate',
            'onTargetsUpdate',
            'onVisualReport',
            'onWorkspaceUpdate',
            'onWorkspaceMetricsChange',
            'highlightBlockById',
            'setBlocks',
            'setLocale'
        ]);
        this.ScratchBlocks.prompt = this.handlePromptStart;
        this.ScratchBlocks.statusButtonCallback = this.handleConnectionModalStart;
        this.ScratchBlocks.recordSoundCallback = this.handleOpenSoundRecorder;

        this.state = {
            width: 0,
            height: 0,
            prompt: null
        };
        this.myRef = React.createRef()
        this.onTargetsUpdate = debounce(this.onTargetsUpdate, 100);
        this.toolboxUpdateQueue = [];
        this.highlightTimeout = null;
        this.noteTimeouts = new Map();

        setInterval(() => {
            // if (this.queue.length == 1 && this.queue[0].type == "move") {
            //     //console.log("blah")
            //     const ev = this.ScratchBlocks.Events.fromJson(this.queue[0], this.workspace)
            //     ev.recordUndo = true;
            //     this.sendInformation(ev);
            //     this.queue.length = 0;
            // }
            const scale = this.workspace.scale / 0.675
            const dragRelative = {x: this.workspace.scrollX * scale, y: this.workspace.scrollY * scale}
            if (sessionStorage.getItem("dragRelative") != JSON.stringify(dragRelative)) {
                //console.log("dragged", dragRelative)
                sessionStorage.setItem("dragRelative", JSON.stringify(dragRelative));
            }
        }, 35); 

        setInterval(() => {
            this.save();
        }, 10 * 60 * 1000); 

        console.log("constructed");
        this.initInformation();

        document.addEventListener('click', this.handleClick.bind(this))

    }

    componentDidMount () {

        // console.log("blocks", this.ScratchBlocks)
        
        this.ScratchBlocks = VMScratchBlocks(this.props.vm, this.props.useCatBlocks);
        this.ScratchBlocks.prompt = this.handlePromptStart;
        this.ScratchBlocks.statusButtonCallback = this.handleConnectionModalStart;
        this.ScratchBlocks.recordSoundCallback = this.handleOpenSoundRecorder;

        this.ScratchBlocks.FieldColourSlider.activateEyedropper_ = this.props.onActivateColorPicker;
        this.ScratchBlocks.Procedures.externalProcedureDefCallback = this.props.onActivateCustomProcedures;
        this.ScratchBlocks.ScratchMsgs.setLocale(this.props.locale);

        const workspaceConfig = defaultsDeep({},
            Blocks.defaultOptions,
            this.props.options,
            {maxBlocks: 5, rtl: this.props.isRtl, toolbox: this.props.toolboxXML, colours: getColorsForTheme(this.props.theme)}
        );
        this.workspace = this.ScratchBlocks.inject(this.blocks, workspaceConfig);

        // Register buttons under new callback keys for creating variables,
        // lists, and procedures from extensions.

        const toolboxWorkspace = this.workspace.getFlyout().getWorkspace();

        const varListButtonCallback = type =>
            (() => {this.ScratchBlocks.Variables.createVariable(this.workspace, null, type)});
        const procButtonCallback = () => {
            this.ScratchBlocks.Procedures.createProcedureDefCallback_(this.workspace);
        };

        toolboxWorkspace.registerButtonCallback('MAKE_A_VARIABLE', varListButtonCallback(''));
        toolboxWorkspace.registerButtonCallback('MAKE_A_LIST', varListButtonCallback('list'));
        toolboxWorkspace.registerButtonCallback('MAKE_A_PROCEDURE', procButtonCallback);

        // Store the xml of the toolbox that is actually rendered.
        // This is used in componentDidUpdate instead of prevProps, because
        // the xml can change while e.g. on the costumes tab.
        this._renderedToolboxXML = this.props.toolboxXML;

        // we actually never want the workspace to enable "refresh toolbox" - this basically re-renders the
        // entire toolbox every time we reset the workspace.  We call updateToolbox as a part of
        // componentDidUpdate so the toolbox will still correctly be updated
        this.setToolboxRefreshEnabled = this.workspace.setToolboxRefreshEnabled.bind(this.workspace);
        this.workspace.setToolboxRefreshEnabled = () => {
            this.setToolboxRefreshEnabled(false);
        };

        // @todo change this when blockly supports UI events
        addFunctionListener(this.workspace, 'translate', this.onWorkspaceMetricsChange);
        addFunctionListener(this.workspace, 'zoom', this.onWorkspaceMetricsChange);

        this.attachVM();
        // Only update blocks/vm locale when visible to avoid sizing issues
        // If locale changes while not visible it will get handled in didUpdate
        if (this.props.isVisible) {
            this.setLocale();
        }

        this.updateDimensions();
        window.addEventListener('resize', this.updateDimensions);
        window.addEventListener('message', this.handleParentMessage);
        
        window.highlightScratchBlock = (blockId, options = {}) =>
            this.highlightBlockById(blockId, options);

        // The menu bar's version arrows change the offset; reload the project at it.
        this.unsubscribeVersionOffset = subscribeVersionOffset(() => this.load());

    }
    shouldComponentUpdate (nextProps, nextState) {
        return (
            this.state.prompt !== nextState.prompt ||
            this.props.isVisible !== nextProps.isVisible ||
            this._renderedToolboxXML !== nextProps.toolboxXML ||
            this.props.extensionLibraryVisible !== nextProps.extensionLibraryVisible ||
            this.props.customProceduresVisible !== nextProps.customProceduresVisible ||
            this.props.locale !== nextProps.locale ||
            this.props.anyModalVisible !== nextProps.anyModalVisible ||
            this.props.stageSize !== nextProps.stageSize
        );
    }
    componentDidUpdate (prevProps) {
        // If any modals are open, call hideChaff to close z-indexed field editors
        if (this.props.anyModalVisible && !prevProps.anyModalVisible) {
            this.ScratchBlocks.hideChaff();
        }

        // Only rerender the toolbox when the blocks are visible and the xml is
        // different from the previously rendered toolbox xml.
        // Do not check against prevProps.toolboxXML because that may not have been rendered.
        if (this.props.isVisible && this.props.toolboxXML !== this._renderedToolboxXML) {
            this.requestToolboxUpdate();
        }

        if (this.props.isVisible === prevProps.isVisible) {
            if (this.props.stageSize !== prevProps.stageSize) {
                // force workspace to redraw for the new stage size
                window.dispatchEvent(new Event('resize'));
            }
            return;
        }
        // @todo hack to resize blockly manually in case resize happened while hidden
        // @todo hack to reload the workspace due to gui bug #413
        if (this.props.isVisible) { // Scripts tab
            this.workspace.setVisible(true);
            if (prevProps.locale !== this.props.locale || this.props.locale !== this.props.vm.getLocale()) {
                // call setLocale if the locale has changed, or changed while the blocks were hidden.
                // vm.getLocale() will be out of sync if locale was changed while not visible
                this.setLocale();
            } else {
                this.props.vm.refreshWorkspace();
                this.requestToolboxUpdate();
            }

            window.dispatchEvent(new Event('resize'));
        } else {
            this.workspace.setVisible(false);
        }
        this.updateDimensions();
    }
    componentWillUnmount () {
        this.detachVM();
        this.workspace.dispose();
        clearTimeout(this.toolboxUpdateTimeout);
        clearTimeout(this.highlightTimeout);
        this.noteTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.noteTimeouts.clear();

        // Clear the flyout blocks so that they can be recreated on mount.
        this.props.vm.clearFlyoutBlocks();
        window.removeEventListener('resize', this.updateDimensions);
        window.removeEventListener('message', this.handleParentMessage);
        if (this.unsubscribeVersionOffset) {
            this.unsubscribeVersionOffset();
            this.unsubscribeVersionOffset = null;
        }
        delete window.highlightScratchBlock;
    }
    requestToolboxUpdate () {
        clearTimeout(this.toolboxUpdateTimeout);
        this.toolboxUpdateTimeout = setTimeout(() => {
            this.updateToolbox();
        }, 0);
    }
    updateDimensions () {
        const rect = JSON.stringify(JSON.parse(JSON.stringify(this.blocks.getBoundingClientRect())))
        sessionStorage.setItem('blocksRect', rect);
        //console.log('block dimensions set to', rect)
    }
    repeatKey(key, length) {
        const keyDigits = key.split('').map(Number);
        const repeatedKey = [];
        for (let i = 0; i < length; i++) {
            repeatedKey.push(keyDigits[i % keyDigits.length]);
        }
        return repeatedKey;
    }
    
    encryptNumber(number, key) {
        const numberDigits = number.split('').map(Number);
        const repeatedKey = this.repeatKey(key, numberDigits.length);
    
        const encryptedDigits = numberDigits.map((num, index) => {
            const sum = num + repeatedKey[index];
            return sum >= 10 ? sum - 10 : sum;
        });
    
        return encryptedDigits.join('');
    }
    handleClick(e) {
        console.log("CLICKED", e.clientX,  " ", e.clientY, " ", window.innerWidth, " ", window.innerHeight)
        fetch('https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/mouse-click', {
            method: 'POST',
            body: JSON.stringify({
                user: name,
                room: ablySpace,
                dragRelative: JSON.parse(sessionStorage.getItem("dragRelative")),
                clickId: this.getRandomHexString(16),
                x: e.clientX,
                y: e.clientY,
                tabIndex: sessionStorage.getItem("activeTabIndex"),
                resolution: {width: window.innerWidth, height: window.innerHeight},
            })
        })
        if (!this.isViewOnly && e.clientX > window.innerWidth - 100 && e.clientY < 50) {
            this.save();
            alert("Saved!")
        }
        if (!this.isViewOnly && e.clientX > window.innerWidth - 175 && e.clientX < window.innerWidth - 100 && e.clientY < 50) {
            navigator.clipboard.writeText("https://collaborationstation.dev/room?view="+this.encryptNumber(ablySpace, "90210"));
            alert("Copied viewonly shareable link to clipboard!")
        }
        if (sessionStorage.getItem('analMode') == "T" && e.clientX > window.innerWidth - 100 && e.clientY < 50) {
            this.vidx = 1;
            this.load();
        }
        if (sessionStorage.getItem('analMode') == "T" && e.clientX > window.innerWidth - 175 && e.clientX < window.innerWidth - 100 && e.clientY < 50) {
            this.vidx = -1;
            this.load();
        }
    }
    setLocale () {
        this.ScratchBlocks.ScratchMsgs.setLocale(this.props.locale);
        this.props.vm.setLocale(this.props.locale, this.props.messages)
            .then(() => {
                if (this.workspace.getFlyout()) {
                    this.workspace.getFlyout().setRecyclingEnabled(false);
                    this.props.vm.refreshWorkspace();
                    this.requestToolboxUpdate();
                    this.withToolboxUpdates(() => {
                        this.workspace.getFlyout().setRecyclingEnabled(true);
                    })
                } else {
                    //console.log('No flyout to refresh');
                };
            });
    }

    updateToolbox () {
        this.toolboxUpdateTimeout = false;

        const categoryId = this.workspace.toolbox_.getSelectedCategoryId();
        const offset = this.workspace.toolbox_.getCategoryScrollOffset();
        this.workspace.updateToolbox(this.props.toolboxXML);
        this._renderedToolboxXML = this.props.toolboxXML;

        // In order to catch any changes that mutate the toolbox during "normal runtime"
        // (variable changes/etc), re-enable toolbox refresh.
        // Using the setter function will rerender the entire toolbox which we just rendered.
        this.workspace.toolboxRefreshEnabled_ = true;

        const currentCategoryPos = this.workspace.toolbox_.getCategoryPositionById(categoryId);
        const currentCategoryLen = this.workspace.toolbox_.getCategoryLengthById(categoryId);
        if (offset < currentCategoryLen) {
            this.workspace.toolbox_.setFlyoutScrollPos(currentCategoryPos + offset);
        } else {
            this.workspace.toolbox_.setFlyoutScrollPos(currentCategoryPos);
        }

        const queue = this.toolboxUpdateQueue;
        this.toolboxUpdateQueue = [];
        queue.forEach(fn => fn());

    }

    withToolboxUpdates (fn) {
        // if there is a queued toolbox update, we need to wait
        if (this.toolboxUpdateTimeout) {
            this.toolboxUpdateQueue.push(fn);
        } else {
            fn();
        }
    }

    waitForAbly() {
        return new Promise((resolve) => {
          if (ably.connection.state === 'connected') {
            resolve();
          } else {
            ably.connection.once('connected', () => {
              resolve();
            });
          }
        });
      }

    async initInformation() {
        if (!hasInited) {
            this.isViewOnly = sessionStorage.getItem('isViewOnly')=="T";
            this.hasLoadedFully = false;
            this.hasLoadedInitially = false;
            this.queueWorkspaceUpdate = false
            this.pauseWorkspaceUpdate = false;
            // stopEmission is a coarse "suppress all outgoing sync" flag used only
            // around long-lived, self-contained local operations (full project load,
            // reverting a losing local edit). It is always paired with try/finally at
            // its call sites so it can never get stuck "on".
            this.stopEmission = false;
            this.errorLoading = false;
            this.keyMarker = null;
            this.versionIdMarker = null;
            this.randomIndex = 0;
            this.cacheEventTime = 50 //ms
            this.maxBatchWaitTime = 200 //ms -- hard ceiling so a batch can never wait forever
            this.vid = -1;
            hasInited = true;

            this.rootVersions = new Map();

            // this.varCallbackFunc = function(a,b,c) {console.log(a,b,c, "callback var trigged early")};

            // --- Outgoing event batching (replaces the old dual queue/messageQueue/backlog system) ---
            this.outgoingBatch = [];
            this.flushTimer = null;
            this.maxWaitTimer = null;

            // --- Loop-prevention for replayed (remote / reverted) events; see runSuppressed() ---
            this.suppressedGroups = new Set();
            this.suppressCounter = 0;

            // --- Serializes target swaps so concurrent remote batches for
            // different sprites can't interleave; see withTargetContext() ---
            this.targetContextChain = Promise.resolve();

            //this.blocks = [];
            this.idToAll = {};
            this.amountOfBlocks = 0;

            console.log("EDING", ably)
            await this.waitForAbly();
            if (!ably.connection.state == "connected") {
                console.log("waiting")
            } else {
                console.log("already connected")
            }
            console.log("connected to Ably!!");

            await channel.subscribe('event', (message) => this.recieveInformation(message));
            await channel.subscribe('highlightBlock', this.handleRemoteHighlightMessage);
            //await channel.subscribe('onSelect', (message) => this.spriteOnSelect(message));
            await channel.subscribe('imageUpdated', (message) => this.imageUpdated(message))
            await channel.subscribe('newJoin', this.newUserJoined.bind(this))
            await channel.subscribe('categorySelected', this.parseCategorySelected)
            await channel.subscribe('goodForLoad', async (msg) => {
                const uid = JSON.parse(msg.data).uid;
                if (uid == nid) {
                    return
                }

                if (!this.hasLoadedInitially) {
                    await this.load();
                    this.hasLoadedInitially = true;
                    
                    this.hasLoadedFully = true;
                    console.log("fully loaded")
                }
            })
            // await channel.subscribe('varPrompt', (message) => {
            //     const data = JSON.parse(message.data);
            //     this.varCallbackFunc(data.a, data.b, data.c);
            // })
            //await channel.subscribe('promptStart', this.handlePrompt.bind(this))
            //await channel.subscribe('promptSubmitted', this.handlePromptSubmitted.bind(this))

            // await channel.attach();
            // const presenceSet = await channel.presence.get();

                // Ensure the channel is attached
            await channel.attach();

            // Fetch the presence data
            const presenceSet = await channel.presence.get();

            console.log("presence", presenceSet)
            
            if (presenceSet.length > 0) {
                //console.log("presence set", presenceSet)
                await channel.publish('newJoin', JSON.stringify({uid: nid}));
            } else {
                await this.load();

                this.hasLoadedFully = true;
                console.log("fully loaded")
            }
            
            await channel.presence.enter() 

        }
    }

    getRootBlockId (blockId) {
        const block = this.workspace.getBlockById(blockId);
        if (!block) return blockId;
        const root = typeof block.getRootBlock === 'function' ? block.getRootBlock() : block;
        return root && root.id ? root.id : blockId;
    }

    captureInverse (eve) {
        // Only meaningful for events that mutate workspace state and support undo.
        if (!eve || typeof eve.run !== 'function') return null;
        return eve;
    }

    // ------------------------------------------------------------------
    // Loop prevention.
    //
    // Whenever we programmatically replay a Blockly event -- because it came
    // from a peer (parseEvent), or because we're rolling back a local edit
    // that lost a conflict (revertLocalRootGroup) -- Blockly's internals may
    // re-fire equivalent change events on our own listeners. Those must not
    // be re-broadcast as if they were new local edits.
    //
    // A plain boolean flag around the replay is NOT safe here, for two
    // reasons:
    //   1) scratch-blocks batches change-listener notifications with an
    //      internal setTimeout(0), so the echo can arrive on a *later* tick
    //      than the one where we flip the flag back off -- a synchronous
    //      try/finally would clear it too early and the echo would slip
    //      through and get re-sent (possible feedback loop).
    //   2) if anything inside the replay throws, a flag that's only reset
    //      "at the end" of the happy path can get stuck "on" forever,
    //      silently killing all future outgoing sync for this client. This
    //      is what "stops syncing entirely" after a null-reference error.
    //
    // Blockly stamps a `group` id onto every event *at creation time*
    // (Events.Abstract reads Events.getGroup() in its constructor), and that
    // stamp survives however long it takes the event to reach our listener.
    // So instead of a flag, we tag a fresh unique group for each replay,
    // remember it, and filter on it whenever our listener fires -- which
    // works regardless of timing. The group is auto-forgotten after a few
    // seconds, so a thrown error can never wedge us permanently.
    runSuppressed (fn) {
        const groupId = `sync-${nid}-${++this.suppressCounter}`;
        this.suppressedGroups.add(groupId);
        setTimeout(() => this.suppressedGroups.delete(groupId), 4000);

        const previousGroup = this.ScratchBlocks.Events.getGroup();
        this.ScratchBlocks.Events.setGroup(groupId);
        try {
            fn();
        } finally {
            // Always restore, even if fn() threw -- never leaves replay mode "stuck on".
            this.ScratchBlocks.Events.setGroup(previousGroup || false);
        }
    }

    isSuppressedEcho (eve) {
        return !!(eve && eve.group && this.suppressedGroups.has(eve.group));
    }

    // Field-change events can arrive with a blockId that hasn't propagated to
    // this client yet (e.g. a field edited immediately after a block is
    // dropped, before the create fully round-trips). As a fallback, senders
    // also attach the field-block's parent id + position among its
    // siblings, which is stable sooner than the block's own id. Only used
    // when the direct id lookup fails.
    resolveIncomingBlockId (event) {
        if (!event || !event.blockId) return event && event.blockId;
        if (this.workspace.getBlockById(event.blockId)) return event.blockId;

        if (event.parentBlockId != null && event.childIndex != null) {
            const parent = this.workspace.getBlockById(event.parentBlockId);
            const child = parent && parent.childBlocks_ && parent.childBlocks_[event.childIndex];
            if (child && child.id) return child.id;
        }
        return event.blockId;
    }

    revertLocalRootGroup (rootId) {
        const versionInfo = this.rootVersions.get(rootId);
        if (!versionInfo || !versionInfo.inverseEvents || versionInfo.inverseEvents.length === 0) {
            return;
        }
    
        console.log("CONFLICT: reverting local root group", rootId, versionInfo);
    
        this.runSuppressed(() => {
            // Undo in reverse order, most-recent-first, mirroring undo-stack semantics.
            for (let i = versionInfo.inverseEvents.length - 1; i >= 0; i--) {
                const inv = versionInfo.inverseEvents[i];
                try {
                    inv.collabFlag = true;
                    inv.run(false); // false = undo direction
                } catch (e) {
                    console.error("failed to revert inverse event", inv, e);
                }
            }
        });
    
        this.rootVersions.delete(rootId);
    }



    handleParentMessage (event) {
        if (!event || !event.data) return;

        const data = event.data;
        if (typeof data !== 'object') return;
        if (data.type !== 'highlightBlock' && data.type !== 'highlightAnyBlock') return;

        const blockId = data.blockId || this.resolveBlockIdForHighlight(data);
        if (!blockId) return;
        this.highlightBlockById(blockId, data);
    }

    handleRemoteHighlightMessage (message) {
        if (!message || !message.data) return;

        let payload = message.data;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            } catch {
                return;
            }
        }

        if (!payload || typeof payload !== 'object') return;
        if (!payload.blockId) {
            payload.blockId = this.resolveBlockIdForHighlight(payload);
        }
        if (!payload.blockId) return;

        this.highlightBlockById(payload.blockId, payload);
    }

    resolveBlockIdForHighlight (options = {}) {
        if (!this.workspace || typeof this.workspace.getAllBlocks !== 'function') return null;

        const allBlocks = this.workspace.getAllBlocks(false);
        if (!Array.isArray(allBlocks) || allBlocks.length === 0) return null;

        const opcode = options.opcode || options.blockType;
        const containsText =
            typeof options.containsText === 'string' && options.containsText.trim()
                ? options.containsText.toLowerCase()
                : null;

        let candidates = allBlocks;

        if (opcode) {
            candidates = candidates.filter(block => block && block.type === opcode);
        }

        if (containsText) {
            candidates = candidates.filter(block => {
                if (!block) return false;

                if (typeof block.toString === 'function' &&
                    String(block.toString()).toLowerCase().includes(containsText)) {
                    return true;
                }

                if (!Array.isArray(block.inputList)) return false;
                return block.inputList.some(input => Array.isArray(input.fieldRow) &&
                    input.fieldRow.some(field => {
                        let fieldText = '';
                        if (field && typeof field.getText === 'function') {
                            fieldText = field.getText();
                        } else if (field && typeof field.getValue === 'function') {
                            fieldText = field.getValue();
                        }
                        return String(fieldText).toLowerCase().includes(containsText);
                    }));
            });
        }

        if (candidates.length === 0) return null;

        const topLevelBlock = candidates.find(block =>
            block && typeof block.getSurroundParent === 'function' && !block.getSurroundParent());
        const resolved = topLevelBlock || candidates[0];
        return resolved && resolved.id ? resolved.id : null;
    }

    highlightBlockById (blockId, options = {}) {
        if (!this.workspace || !blockId) return false;

        const durationMs = Number(options.durationMs) > 0 ? Number(options.durationMs) : 1500;
        const targetName = options.targetName || options.spriteName;

        if (targetName && this.props.vm && this.props.vm.editingTarget && this.props.vm.editingTarget.sprite &&
            this.props.vm.editingTarget.sprite.name !== targetName) {
            const target = this.getTargetByName(targetName);
            if (target) {
                this.props.vm.setEditingTarget(target.id);
                setTimeout(() => this.highlightBlockById(blockId, {
                    ...options,
                    targetName: null,
                    spriteName: null
                }), 60);
                return true;
            }
        }

        const block = this.workspace.getBlockById(blockId);
        if (!block) {
            return false;
        }

        if (typeof options.noteText === 'string' && options.noteText.trim()) {
            const blockPosition = typeof block.getRelativeToSurfaceXY === 'function' ? block.getRelativeToSurfaceXY() : {x: 0, y: 0};
            const blockWidth = typeof block.getWidth === 'function' ? block.getWidth() : 0;
            const noteX = blockPosition.x + blockWidth + 32;
            const noteY = blockPosition.y;

            if (typeof block.setCommentText === 'function') {
                block.setCommentText(options.noteText, null, noteX, noteY, false);
                if (block.comment && typeof block.comment.setVisible === 'function') {
                    block.comment.setVisible(true);
                }
            }
        }

        // Match Scratch runtime style glow: block glow plus script glow, without selecting or recentering.
        const rootBlock = typeof block.getRootBlock === 'function' ? block.getRootBlock() : null;
        if (rootBlock && rootBlock.id) {
            this.workspace.glowStack(rootBlock.id, true);
        }
        this.workspace.glowBlock(blockId, true);

        clearTimeout(this.highlightTimeout);
        this.highlightTimeout = setTimeout(() => {
            if (!this.workspace) return;
            if (rootBlock && rootBlock.id) {
                this.workspace.glowStack(rootBlock.id, false);
            }
            this.workspace.glowBlock(blockId, false);
        }, durationMs);

        return true;
    }

    async spriteOnSelect(msg) {
        //if (blockEmission) {return}
        
        const data = JSON.parse(msg.data)
        let id = data.num;
        const eventInfo = data.data;
        
        this.stopEmission = true;
        console.log(JSON.stringify(eventInfo));
        this.props.vm.addSprite(JSON.stringify(eventInfo)).then(() => {
            this.props.onActivateBlockTab(0);
        });
        this.stopEmission = false;
    }

    async fetchAndConvertToImageData(url) {
        try {
            // Fetch the image as a blob
            const response = await fetch(url);
            const blob = await response.blob();
            
            // Create an HTMLImageElement
            const img = new Image();
            
            // Create a promise that resolves when the image has loaded
            const loaded = new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            
            // Set the image source to the fetched URL
            img.src = URL.createObjectURL(blob);
            
            // Wait for the image to load
            await loaded;
            
            // Create a canvas element
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set the canvas dimensions to match the image
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw the image on the canvas
            ctx.drawImage(img, 0, 0);
            
            // Get ImageData from the canvas
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Return the ImageData object
            return imageData;
            
        } catch (error) {
            console.error('Error fetching or converting image:', error);
            throw error;
        }
    }

    async imageUpdated(msg) {
        const data = JSON.parse(msg.data);

        console.log(data);

        if (data.name == uname) {
            return;
        }
        
        const md5 = data.md5;
        const rotationCenterX = data.rotationCenterX;
        const rotationCenterY = data.rotationCenterY;
        const isVector = data.isVector;
        const costumeIndex = data.selectedIdx;

        const ext = isVector ? 'svg' : 'png';

        
        if (isVector) {
            const resload = await fetch(`https://d3pl0tx5n82s71.cloudfront.net/${md5}.${ext}`)
            const image = await resload.text();
            console.log('recieved', image)
            this.props.vm.updateSvg(
                costumeIndex,
                image,
                rotationCenterX,
                rotationCenterY,
                data.editingTarget
            );
        } else {
            // const arrayBuffer = await resload.arrayBuffer();
            // const uint8Array = new Uint8Array(arrayBuffer);
            // let binaryString = '';
            // for (let i = 0; i < uint8Array.length; i++) {
            //     binaryString += String.fromCharCode(uint8Array[i]);
            // }
            const image = await this.fetchAndConvertToImageData(`https://d3pl0tx5n82s71.cloudfront.net/${md5}.${ext}`)
            // console.log('recieved', image)
            // console.log("class", this.fetchAndConvertToImageData(binaryString))
            this.props.vm.updateBitmap(
                costumeIndex,
                image,
                rotationCenterX,
                rotationCenterY,
                2 /* bitmapResolution */,
                data.editingTarget
            );
        }
        

        // const res2 = await fetch("https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/assetID",{
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json'
        //     },
        //     body: `[${JSON.stringify({
        //         assetID: assetId,
        //         isCustom: "True"
        //     })}]`
        // })
        // console.log(res2)

    }

    /**
     * Read one s3-storage response into a version payload. A brand-new room (a 404
     * "No versions found" body) and an unreadable object (the lambda substitutes the
     * literal string 'EMT') both come back as null.
     * @param {Response} response - the fetch response to read.
     * @returns {?object} the version payload, or null if there is no version there.
     */
    async readVersionResponse(response) {
        const text = await response.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch (e) {
            throw new Error("Unexpected response from s3-storage: " + text);
        }
        if (!payload || !payload.versionData || payload.versionData === 'EMT') {
            return null;
        }
        return payload;
    }

    /**
     * Resolve a single version of the project out of the bucket.
     *
     * The lambda walks its own history: `versionOffset` counts distinct saves back
     * from the current one (0 = current, 1 = one save back, ...), skipping runs of
     * identical-size versions so a stretch of no-op autosaves counts as one step. It
     * clamps to the oldest save and reports the offset it actually reached.
     *
     * @param {number} offset - 0 for the current save, 1 for one save back, etc.
     * @returns {object} {payload, offset}, where offset is the version actually
     *     reached and payload is null only when the room has never been saved.
     */
    async fetchProjectVersion(offset) {
        const response = await fetch(S3_STORAGE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({key: inSpace, versionOffset: offset})
        });

        const payload = await this.readVersionResponse(response);
        if (!payload) {
            return {payload: null, offset: 0};
        }

        const reached = typeof payload.versionOffset === 'number' ?
            payload.versionOffset :
            offset;
        return {payload: payload, offset: reached};
    }

    async load() {

        if (this.startingLoad) {
            return;
        }

        try {
            this.startingLoad = true;
            this.stopEmission = true;

            const requestedOffset = getVersionOffset();
            console.log("TOLOAD", {key: inSpace, versionOffset: requestedOffset})

            const {payload, offset: loadedOffset} = await this.fetchProjectVersion(requestedOffset);

            if (loadedOffset !== requestedOffset) {
                // Asked for more history than exists - pin the UI to what we actually
                // loaded. This re-enters load(), which no-ops on startingLoad.
                setVersionOffset(loadedOffset);
            }

            if (!payload) {
                console.log("starting new project...")
            } else {
                const jsonParsed = payload;
                console.log("JSPARESE")
                this.keyMarker = jsonParsed.keyMarker;
                this.versionIdMarker = jsonParsed.versionIdMarker;
                this.loadedVersionId = jsonParsed.versionId;

                let data = JSON.parse(jsonParsed.versionData);
                // vm.toJSON() returns a string, so the save payload is double-encoded.
                // The lambda peels one layer, but a version written during the window
                // where it didn't will still be a string after the first parse.
                if (typeof data === 'string') {
                    data = JSON.parse(data);
                }
                if (!data || !Array.isArray(data.targets)) {
                    throw new Error('Stored project has no targets array: ' +
                        JSON.stringify(jsonParsed.versionData).slice(0, 200));
                }
                console.log(data)
                const targets = data.targets;
                let hasSeenStage = false;
                const targets2 = [...targets];
                for (let target of targets2) {


                    if (target.isStage) {
                        if (hasSeenStage) {
                            const idx = targets.indexOf(target);
                            targets.splice(idx, 1);
                            console.log("removed", target)
                            continue;
                        }

                        hasSeenStage = true;
                    }

                    const costumes = target.costumes;
                    for (let costume of costumes) {
                        // Normalize md5ext for older/incomplete saves instead of deleting costumes.
                        if (!costume.hasOwnProperty("md5ext") || !costume.md5ext || costume.md5ext.includes("undefined")) {
                            if (costume.assetId && costume.dataFormat) {
                                costume.md5ext = `${costume.assetId}.${costume.dataFormat}`;
                            } else if (costume.md5) {
                                costume.md5ext = costume.md5.includes('.') ?
                                    costume.md5 :
                                    `${costume.md5}.${costume.dataFormat || 'svg'}`;
                            }
                        }
                    }
                }
                const data2 = JSON.stringify(data);
                await this.props.vm.loadProject(data2);
            }

            //this.props.vm.editingTarget.setCostume(1);
        } catch (error) {

            console.log(error)

            alert("Error loading project: " + JSON.stringify(error));
            console.error('Error fetching data from S3:', error);
            this.errorLoading = true;
        }

        // this.props.vm.editingTarget = this.props.vm.runtime.getSpriteTargetByName("Apple");
        // this.props.vm.editingTarget = this.props.vm.runtime.getSpriteTargetByName("Taco");

        // Always reset, success or failure, so a later load() call (e.g. a
        // subsequent goodForLoad/analMode replay) isn't permanently blocked.
        this.startingLoad = false;
        this.stopEmission = false;
        
    }

    ret(){return 3;}

    async save() {

        if (this.isViewOnly) {
            console.log("view only mode; ignoring save")
            return;
        }

        // Saving while an older version is on screen would write that old project back
        // over the current one, so history browsing is read-only.
        if (getVersionOffset() > 0) {
            console.log("viewing an older version; ignoring save")
            return;
        }

        if (!this.hasLoadedFully) {
            console.log("not loaded fully; trying to save. Ignoring.")
            return;
        }

        const s = JSON.stringify(this.props.vm.toJSON())
        console.log("SAVED!!!")
        
        await fetch(S3_STORAGE_URL, {
            method: 'POST',
            body: inSpace+"~|@^|@|~"+s
        });

        this.props.vm.renderer.requestSnapshot(async (dataURI) => {
            dataURI = dataURI.replace(/^data:image\/\w+;base64,/, '');
            const imagename = inSpace + ".png"
            console.log("SAVEDTO", dataURI);
            console.log(imagename)
            const resp = await fetch("https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/images?fileName=" + imagename + "&cd=attachment", {
                method: 'POST',
                headers: {
                    'Accept': '*/*',
                    'Connection': 'keep-alive',
                    'Content-Type': 'image/png',
                    'Content-Disposition': 'attachment',
                },
                body: dataURI,
            });
            console.log(resp)
            
        });

    }
 
    // heavily edited from https://github.com/BlockliveScratch/Blocklive/blob/master/extension/scripts/editor.js#L834

    getRandomHexString(length) {
        const chars = '0123456789abcdef';
        let result = '';
        for (let i = 0; i < length; i++) {
          const randomIndex = Math.floor(Math.random() * chars.length);
          result += chars[randomIndex];
        }
        return result;
    }

    logData (data) {
        if (!this.hasLoadedFully || this.isViewOnly) {
            return
        }
        console.log("posting'", data)
        fetch('https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/blockPlacement', {
            method: 'POST',
            body: JSON.stringify(data)
        }).then(resp => console.log('logged', resp));
    }


    sendInformation (eve) {

        if (this.isViewOnly) {
            return;
        }

        // Browsing history is local: the workspace holds an old project, so broadcasting
        // its events would push that old state onto everyone else in the room.
        if (getVersionOffset() > 0) {
            return;
        }

        // Coarse suppression (full project load) or fine per-replay suppression
        // (a remote event / conflict revert we just applied echoing back through
        // our own change listener). See runSuppressed() for why this is safe
        // against both async-deferred echoes and mid-replay exceptions.
        if (this.stopEmission || this.isSuppressedEcho(eve)) {
            return;
        }

        if ( !(eve.element == "click" || eve.element == "stackclick" || eve.element == "field") ) {
            if ( (eve.group == "" || !eve.recordUndo) ) {
                return;
            }
        }

        // Field-change events can reference a blockId that hasn't finished
        // propagating to other clients yet. Attach the field-block's parent +
        // sibling index as a fallback the receiver can use if a direct
        // blockId lookup fails (see resolveIncomingBlockId). Computed and
        // attached per-message, so a batch containing several different
        // field edits resolves each one correctly on the far end.
        let parentBlockId = null;
        let childIndex = null;
        if (eve.element == "field") {
            const fieldBlock = this.workspace.getBlockById(eve.blockId);
            const parentBlock = fieldBlock && fieldBlock.parentBlock_;
            if (parentBlock) {
                parentBlockId = parentBlock.id;
                childIndex = parentBlock.childBlocks_.indexOf(fieldBlock);
            }
        }

        if (this.hasLoadedFully) {
            this.logData({
                moveId: this.getRandomHexString(16),
                time: Date.now(),
                user: name,
                room: ablySpace,
                type: eve.type,
                target: this.props.vm.editingTarget.sprite.name,
                event: eve,
            });
        }

        const nowTs = Date.now();
        if (eve.blockId && this.workspace.getBlockById(eve.blockId)) {
            const rootId = this.getRootBlockId(eve.blockId);
            const existing = this.rootVersions.get(rootId);
            const inverse = this.captureInverse(eve);

            this.rootVersions.set(rootId, {
                timestamp: nowTs,
                inverseEvents: existing && existing.inverseEvents
                    ? [...existing.inverseEvents, inverse].filter(Boolean)
                    : [inverse].filter(Boolean),
            });
        }

        let singleMessage;
        try {
            singleMessage = eve.toJson();
        } catch (e) {
            // If an event can't even be serialized there's nothing safe to send;
            // drop just this one event rather than let the exception propagate
            // and potentially interrupt Blockly's own change-listener loop.
            console.error("failed to serialize local event, dropping it", eve, e);
            return;
        }
        singleMessage.ts = nowTs;

        if (parentBlockId != null) {
            singleMessage.parentBlockId = parentBlockId;
            singleMessage.childIndex = childIndex;
        }

        if (eve.type == "change" && eve.name == "BROADCAST_OPTION") {
            singleMessage.broadcastInfo = {
                broadcastName: this.props.vm.runtime.getTargetForStage().variables[eve.newValue]?.name,
                broadcastId: this.props.vm.runtime.getTargetForStage().variables[eve.newValue]?.id,
            }
        }

        if (eve.type == "comment_create") {
            singleMessage.commentXY = eve.xy;
        }

        this.queueOutgoing(singleMessage);
    }

    // Adds a message to the outgoing batch and schedules it to be flushed.
    // Two timers govern the flush:
    //   - flushTimer: a short "quiet period" debounce (cacheEventTime) that
    //     resets on every new message, so closely-spaced events (e.g. a
    //     block "create" immediately followed by its "move" into place) go
    //     out together in one publish.
    //   - maxWaitTimer: a hard ceiling (maxBatchWaitTime) started when the
    //     batch first becomes non-empty and never reset, guaranteeing a
    //     batch is flushed promptly even under a steady trickle of events
    //     that would otherwise keep re-arming the debounce forever.
    queueOutgoing (singleMessage) {
        this.outgoingBatch.push(singleMessage);

        if (!this.maxWaitTimer) {
            this.maxWaitTimer = setTimeout(() => this.flushOutgoing(), this.maxBatchWaitTime);
        }
        clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => this.flushOutgoing(), this.cacheEventTime);
    }

    // Kept as a thin wrapper around queueOutgoing/flushOutgoing so any other
    // caller expecting the old sendArray(arr, ...) signature keeps working.
    sendArray (arr) {
        for (const msg of arr) {
            this.outgoingBatch.push(msg);
        }
        this.flushOutgoing();
    }

    async flushOutgoing () {
        clearTimeout(this.flushTimer);
        clearTimeout(this.maxWaitTimer);
        this.flushTimer = null;
        this.maxWaitTimer = null;

        if (this.outgoingBatch.length === 0) {
            return;
        }

        const messages = this.outgoingBatch;
        this.outgoingBatch = [];

        const message = {
            uid: nid,
            target: this.props.vm.editingTarget.sprite.name,
            messages: messages,
            rIDX: this.randomIndex,
            dir: true
        };

        try {
            await channel.publish('event', JSON.stringify(message));
        } catch (e) {
            // Never silently drop edits because a publish failed (offline blip,
            // Ably hiccup, etc). Put them back at the front of the batch and
            // retry shortly -- this is the fix for "sometimes it just doesn't
            // send": the old code left its debounce timer permanently non-null
            // after a thrown error here, which silently stopped ALL future
            // sends for the rest of the session.
            console.error("failed to publish sync event, will retry", e);
            this.outgoingBatch = messages.concat(this.outgoingBatch);
            this.maxWaitTimer = setTimeout(() => this.flushOutgoing(), 1000);
        }
    }

    recieveInformation (message) {

        let data;
        try {
            data = JSON.parse(message.data);
        } catch (e) {
            console.error("received malformed sync message, ignoring", e);
            return;
        }

        if (data.uid == nid) {
            return;
        }

        this.randomIndex = data.rIDX;
        const targetName = data.target;
        const dir = data.dir;

        // Applies the whole batch inside withTargetContext, which guarantees
        // we end up back on the local user's own target -- and that the
        // edits actually land -- no matter what happens while applying. See
        // withTargetContext for the two failure modes this replaces.
        this.withTargetContext(targetName, () => {
            for (const msg of data.messages) {
                this.parseEvent(msg, targetName, dir);
            }
        });
    }


    // Temporarily points the workspace at `targetName` (a remote peer's
    // sprite/stage), runs `applyFn`, then unconditionally restores the local
    // user's own target -- serialized against any other pending swap, so two
    // incoming batches for different sprites can never interleave.
    //
    // The old changeTarget()/revertToOriginalTarget() pair tracked "the
    // target to go back to" (lastTempId) as shared mutable state and relied
    // on a setTimeout(1) to trigger the revert later, decoupled from whether
    // applying the incoming batch had actually finished. That meant:
    //   - if two remote batches for different sprites arrived close
    //     together, the second changeTarget() call would overwrite
    //     lastTempId before the first's revert ran, and the user's own
    //     target was never correctly restored -- i.e. they'd stay stuck
    //     looking at a teammate's sprite.
    // A naive fully-synchronous swap-apply-restore fixes that, but breaks
    // something else: persisting the applied edits into tmpTarget's block
    // model happens through vm.blockListener, which scratch-blocks notifies
    // on a *deferred* tick (internally via setTimeout(0)). Restore back to
    // the local target before that tick fires and the notification lands
    // against the wrong (already-restored) target -- the edit is silently
    // dropped. So we still yield briefly before restoring, but do it through
    // a single chain (targetContextChain) instead of independent timers, so
    // concurrent swaps queue up one-at-a-time rather than racing.
    withTargetContext (targetName, applyFn) {
        this.targetContextChain = this.targetContextChain
            .then(() => this.applyWithTargetContext(targetName, applyFn))
            .catch(e => console.error("error in target-context chain", e));
        return this.targetContextChain;
    }

    async applyWithTargetContext (targetName, applyFn) {
        if (!targetName || targetName == this.props.vm.editingTarget.sprite.name) {
            try {
                applyFn();
            } catch (e) {
                console.error("error applying remote events", e);
            }
            return;
        }

        const originalTargetId = this.props.vm.editingTarget.id;
        const tmpTarget = this.getTargetByName(targetName);
        if (!tmpTarget) {
            // Target doesn't exist locally yet (e.g. a sprite-creation message
            // hasn't arrived/applied yet) -- drop this batch rather than crash.
            console.warn("remote target not found, dropping batch for", targetName);
            return;
        }

        this.disableWorkspaceUpdate();
        try {
            this.props.vm.editingTarget = tmpTarget;
            this.props.vm.emitWorkspaceUpdate();
            this.props.vm.runtime._editingTarget = tmpTarget;

            applyFn();

            // Give scratch-blocks' deferred change-listener dispatch a chance
            // to run (and thus vm.blockListener a chance to persist the edit
            // into tmpTarget) while tmpTarget is still the active target.
            await new Promise(resolve => setTimeout(resolve, 4));
        } catch (e) {
            console.error("error applying remote events", e);
        } finally {
            // Restore the user's own target. Order matters here: reload the
            // workspace content back to their own blocks *while still
            // hidden*, and only reveal the canvas once that's done --
            // revealing first (what enableWorkspaceUpdate() + setEditingTarget()
            // in that order would do) shows one visible frame of the other
            // person's blocks in between. Un-pause before reloading (rather
            // than after) so this setEditingTarget's onWorkspaceUpdate call
            // does the *full* restore -- toolbox, workspace metrics,
            // sessionStorage -- since, unlike the quiet swap-in above, this
            // is a real switch back to what the user should be seeing.
            this.pauseWorkspaceUpdate = false;
            this.props.vm.setEditingTarget(originalTargetId);

            // The reload call above returning doesn't guarantee the browser
            // has actually *painted* the reloaded blocks yet -- Blockly's
            // SVG rendering isn't necessarily fully settled in the same JS
            // tick as the DOM mutation. Revealing immediately after could
            // still catch a half-rendered or stale frame, which is what the
            // remaining flicker was. Waiting two animation frames is the
            // standard way to guarantee we're past that paint before we
            // show it, without needing to know Blockly's exact internals.
            await new Promise(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });

            if (this.workspace && this.workspace.svgBlockCanvas_) {
                this.workspace.svgBlockCanvas_.style.visibility = 'visible';
            }
            if (this.queueWorkspaceUpdate) {
                this.queueWorkspaceUpdate = false;
                this.props.vm.emitWorkspaceUpdate();
            }
        }
    }

    parseEvent (event, targetName="", dir=true) {

        // Resolve a possibly-stale field-event blockId via the parent+index
        // fallback before doing anything else with it.
        event.blockId = this.resolveIncomingBlockId(event);

        if (targetName == "") {
            targetName = this.props.vm.editingTarget.sprite.name;
        }
        if (event.type == "comment_change") {
            event.newValue = event.newContents
        }
    
        if (this.workspace.getBlockById(event.blockId) == null && (event.type != "create")) {
            console.log(event, "discarded because block does not exist")
            return;
        }
    
        // Conflict check, root-block scoped. event.ts is the sender's local
        // timestamp for this op (set in sendInformation above). If we have a
        // local mutation on this same root group that's NEWER than the
        // incoming event's timestamp, our local edit lost the race window
        // (we sent ours, then this arrived). Per the agreed rule: incoming
        // wins. Revert our local change first, then fall through to apply
        // the incoming event normally.
        if (event.blockId && typeof event.ts === 'number') {
            const rootId = this.getRootBlockId(event.blockId);
            const localVersion = this.rootVersions.get(rootId);
    
            if (localVersion && localVersion.timestamp > event.ts) {
                console.log(
                    "CONFLICT: local edit on root", rootId,
                    "at", localVersion.timestamp,
                    "is newer than incoming event at", event.ts,
                    "— incoming wins, reverting local"
                );
                this.revertLocalRootGroup(rootId);
                // continue below to apply the incoming event onto the now-reverted state
            } else if (localVersion) {
                // No conflict, incoming is newer/equal — incoming will be applied
                // as the new authoritative state for this root below. Clear the
                // stale local pending record so future incoming events for this
                // root aren't spuriously compared against an op we've already
                // lost the right to defend.
                this.rootVersions.delete(rootId);
            }
        }

        if (event.type == "move") {
            const movedBlock = this.workspace.getBlockById(event.blockId);
            const svgRoot = movedBlock && typeof movedBlock.getSvgRoot === 'function' ? movedBlock.getSvgRoot() : null;
            if (svgRoot) {
                svgRoot.style.transition = "transform 0.5s";
            }
        }
    
        let eventInstance;
        try {
            eventInstance = this.ScratchBlocks.Events.fromJson(event, this.workspace);
        } catch (e) {
            console.error("failed to deserialize remote event, dropping it", event, e);
            return;
        }
    
        if (event.type == "comment_create") {
            eventInstance.xy = event.commentXY
        }

        // Deleting a block with blocks nested/attached inside it (inputs,
        // C-block statements, or blocks stacked below) is transmitted as a
        // single delete event for the top block -- scratch-blocks disables
        // events for the recursive child disposal and only fires one event
        // for the whole subtree (the same pattern this file's own
        // domToBlock override uses for creation: build the whole subtree
        // with events off, fire one BlockCreate at the end). Normally
        // block.dispose() cascades through those same connections on the
        // receiving end too, so this is just a safety net -- but capture
        // the full subtree now, before anything is torn down, so we can
        // verify afterward that all of it is actually gone.
        let descendantIdsToVerify = null;
        if (event.type == "delete") {
            const blockToDelete = this.workspace.getBlockById(event.blockId);
            if (blockToDelete && typeof blockToDelete.getDescendants === 'function') {
                try {
                    descendantIdsToVerify = blockToDelete.getDescendants(false).map(b => b.id);
                } catch (e) {
                    descendantIdsToVerify = null;
                }
            }
        }

        // Everything that actually mutates the workspace runs inside
        // runSuppressed(), which guarantees (via try/finally on the Blockly
        // event group) that our own change listener won't re-broadcast this
        // as a new local edit -- and, critically, can never get stuck
        // suppressing *future* real edits even if something below throws
        // (e.g. a stale/missing block reference). This directly fixes the
        // "stops syncing entirely after an error" failure mode.
        this.runSuppressed(() => {
            // A try/catch scoped to just this one event means a single bad or
            // stale event (e.g. referencing a block that's already gone)
            // can't abort the rest of the batch -- the caller's loop over
            // data.messages keeps going, so one problem event degrades to a
            // logged warning instead of desyncing everything after it.
            try {
                const existingBlock = this.workspace.getBlockById(event.blockId);
                let isProcedureDefinition = (eventInstance.type == "delete" &&
                    existingBlock && existingBlock.type == "procedures_definition");
                if (eventInstance.type == "create" && event.xml && event.xml.indexOf("mutation proccode") != -1) {
                    isProcedureDefinition = true;
                }

                if (event.broadcastInfo) {
                    const broadcastEvent = {isCloud: false, isLocal: false, type: "var_create", varId: event.broadcastInfo.broadcastId, varName: event.broadcastInfo.broadcastName, varType: "broadcast_msg"}
                    this.props.vm.blockListener(broadcastEvent)
                    const newEvent = this.ScratchBlocks.Events.fromJson(broadcastEvent, this.workspace);
                    newEvent.run(dir);
                }

                eventInstance.run(dir);
                if (eventInstance.type == "ui") {
                    this.props.vm.editingTarget.blocks.blocklyListen(eventInstance);
                }

                // Safety net: if any block from the deleted subtree is
                // somehow still around (getBlockById still finds it), finish
                // the job explicitly rather than leaving orphaned blocks
                // floating on this client only.
                if (descendantIdsToVerify) {
                    for (const leftoverId of descendantIdsToVerify) {
                        if (leftoverId === event.blockId) continue; // handled by eventInstance.run above
                        const leftover = this.workspace.getBlockById(leftoverId);
                        if (leftover) {
                            console.log("cascading delete: cleaning up orphaned nested block", leftoverId);
                            try {
                                leftover.dispose(false);
                            } catch (e) {
                                console.error("failed to dispose orphaned nested block", leftoverId, e);
                            }
                        }
                    }
                }

                if (isProcedureDefinition && this.workspace.getToolbox()) {
                    this.workspace.getToolbox().refreshSelection();
                }

                if (event.blockId && typeof event.ts === 'number') {
                    const rootId = this.getRootBlockId(event.blockId);
                    this.rootVersions.set(rootId, {
                        timestamp: event.ts,
                        inverseEvents: null, // remote-sourced; we don't own an inverse for it
                    });
                }
            } catch (e) {
                console.error("error applying remote event -- skipping it, sync continues", event, e);
            }
        });
    }


    disableWorkspaceUpdate() {
        console.log("DISABLED!!")
        this.pauseWorkspaceUpdate = true;
        if (this.workspace && this.workspace.svgBlockCanvas_) {
            this.workspace.svgBlockCanvas_.style.visibility = 'hidden';
        }
    }

    enableWorkspaceUpdate() {
        console.log("ENABLED!!")
        this.pauseWorkspaceUpdate = false;
        if (this.workspace && this.workspace.svgBlockCanvas_) {
            this.workspace.svgBlockCanvas_.style.visibility = 'visible';
        }
        if (this.queueWorkspaceUpdate) {
            this.queueWorkspaceUpdate = false;
            this.props.vm.emitWorkspaceUpdate();
        }
    }

    attachVM () {
        let oldEWU = (this.props.vm.emitWorkspaceUpdate).bind(this.props.vm);
        this.props.vm.emitWorkspaceUpdate = function() {
            if (this.pauseWorkspaceUpdate) {
                this.queueWorkspaceUpdate = true;
                // return;
            }
            oldEWU();
        }
        this.sendChangeListener = (eve) => {
            this.sendInformation(eve);
        };
        this.workspace.addChangeListener(this.sendChangeListener);
        this.workspace.addChangeListener(this.props.vm.blockListener);
        this.workspace.addChangeListener((eve) => {
            // console.log('forced',eve)
            this.sendInformation.bind(this)(eve)
        })
        // this.workspace.addChangeListener(this.enableEmission.bind(this))
        //this.workspace.addChangeListener(this.save.bind(this))
        this.flyoutWorkspace = this.workspace
            .getFlyout()
            .getWorkspace();
        this.flyoutWorkspace.addChangeListener(this.props.vm.flyoutBlockListener);
        this.flyoutWorkspace.addChangeListener(this.props.vm.monitorBlockListener);
        this.props.vm.addListener('SCRIPT_GLOW_ON', this.onScriptGlowOn);
        this.props.vm.addListener('SCRIPT_GLOW_OFF', this.onScriptGlowOff);
        this.props.vm.addListener('BLOCK_GLOW_ON', this.onBlockGlowOn);
        this.props.vm.addListener('BLOCK_GLOW_OFF', this.onBlockGlowOff);
        this.props.vm.addListener('VISUAL_REPORT', this.onVisualReport);
        this.props.vm.addListener('workspaceUpdate', this.onWorkspaceUpdate);
        this.props.vm.addListener('targetsUpdate', this.onTargetsUpdate);
        this.props.vm.addListener('MONITORS_UPDATE', this.handleMonitorsUpdate);
        this.props.vm.addListener('EXTENSION_ADDED', this.handleExtensionAdded);
        this.props.vm.addListener('BLOCKSINFO_UPDATE', this.handleBlocksInfoUpdate);
        this.props.vm.addListener('PERIPHERAL_CONNECTED', this.handleStatusButtonUpdate);
        this.props.vm.addListener('PERIPHERAL_DISCONNECTED', this.handleStatusButtonUpdate);

        function incrementStringNumber(str) {
            return str.replace(/(\d+)?$/, (match) => match ? parseInt(match) + 1 : '1');
        }

        let ogAddSprite = this.props.vm.addSprite.bind(this.props.vm);
        this.props.vm.addSprite = (input) => {
            const inputJSONED = JSON.parse(input);
            let spriteName = inputJSONED.name ? inputJSONED.name : inputJSONED.objName;
            
            if (spriteName == "Stage") {
                spriteName = "Stage1";
            }

            while(true) {
                let isDuplicate = false;
                for (let target of this.props.vm.runtime.targets) {
                    if (target.sprite.name == spriteName) {
                        if (!this.hasLoadedFully) {
                            return
                        }
                        spriteName = incrementStringNumber(spriteName)
                        isDuplicate = true;
                        console.log("DUPLICAATE")
                        break;
                    }
                }
                if (!isDuplicate) {
                    break;
                }
            }
            inputJSONED.objName = spriteName;
            inputJSONED.name = spriteName;
            input = JSON.stringify(inputJSONED);

            this.logData({
                moveId: this.getRandomHexString(16),
                time: Date.now(),
                user: uname,
                room: ablySpace,
                type: "custom:createSprite",
                spriteName: inputJSONED.name,
            });

            const msg = {input: input, uid: nid};
            if (this.hasLoadedFully) {
                channel.publish('newSprite', JSON.stringify(msg));
            }
            return ogAddSprite(input);
        }
        channel.subscribe('newSprite', async (message) => {
            const data = JSON.parse(message.data);
            if (data.uid == nid) {
                return;
            }
            const input = data.input;
            const ogName = this.props.vm.editingTarget.sprite.name;
            await ogAddSprite(input);
            
            this.props.vm.setEditingTarget(this.getTargetByName(ogName).id);
            // this.props.vm.editingTarget = this.getTargetByName(ogName);
            // this.props.vm.runtime.setEditingTarget(this.props.vm.editingTarget); 
        });

        let ogDeleteSprite = this.props.vm.deleteSprite.bind(this.props.vm)
        this.props.vm.deleteSprite = (targetID) => {
            const name = this.props.vm.runtime.getTargetById(targetID).sprite.name;
            
            this.logData({
                moveId: this.getRandomHexString(16),
                time: Date.now(),
                user: uname,
                room: ablySpace,
                type: "custom:deleteSprite",
                spriteName: name,
            });
            
            
            channel.publish('deleteSprite', JSON.stringify(name));
        }
        channel.subscribe('deleteSprite', (message) => {
            const name = JSON.parse(message.data)
            const id = this.getTargetByName(name).id
            ogDeleteSprite(id)
        });

        let ogAddBackdrop = this.props.vm.addBackdrop.bind(this.props.vm);
        this.props.vm.addBackdrop = async (md5, vmBackdrop) => {
            const msg = {m5: md5, vmb: vmBackdrop};
            channel.publish('newBackdrop', JSON.stringify(msg));
        }
        channel.subscribe('newBackdrop', (message) => {
            const d = JSON.parse(message.data);
            ogAddBackdrop(d.m5, d.vmb);
        });

        let ogRenameSprite = this.props.vm.renameSprite.bind(this.props.vm);
        this.props.vm.renameSprite = async (id, name) => {
            const spriteName = this.props.vm.runtime.getTargetById(id).sprite.name;

            if (name == "Stage") {
                name = "Stage1";
            }

            while(true && this.hasLoadedFully) {
                let isDuplicate = false;
                for (let target of this.props.vm.runtime.targets) {
                    if (target.sprite.name == name && target.sprite.name != spriteName) {
                        name = incrementStringNumber(name)
                        isDuplicate = true;
                        console.log("DUPLICAATE")
                        break;
                    }
                }
                if (!isDuplicate) {
                    break;
                }
            }

            this.logData({
                moveId: this.getRandomHexString(16),
                time: Date.now(),
                user: uname,
                room: ablySpace,
                type: "custom:renameSprite",
                spriteName: spriteName,
                newName: name,
            });

            const msg = {spriteName: spriteName, name: name};
            channel.publish('renameSprite', JSON.stringify(msg));
        }
        channel.subscribe('renameSprite', (message) => {
            const d = JSON.parse(message.data);
            ogRenameSprite(this.getTargetByName(d.spriteName).id, d.name);
        });

        let ogDuplicateSprite = this.props.vm.duplicateSprite.bind(this.props.vm);
        this.props.vm.duplicateSprite = async (id) => {
            const name = this.props.vm.runtime.getTargetById(id).sprite.name;
            return channel.publish('duplicateSprite', JSON.stringify(name));
        }
        channel.subscribe('duplicateSprite', (message) => {
            const name = JSON.parse(message.data)
            const id = this.getTargetByName(name).id;
            ogDuplicateSprite(id);
        });

        let ogSpriteInfo = this.props.vm.postSpriteInfo
        this.props.vm.postSpriteInfo = (data) => {
            let name = this.props.vm.editingTarget.sprite.name;
            if (this.props.vm._dragTarget) {
                name = this.props.vm._dragTarget.sprite.name;
            }
            const msg = {name: name, data: data, uid: nid};
            if (this.hasLoadedFully) {
                channel.publish('spriteInfo', JSON.stringify(msg));
            }
            this.getTargetByName(name).postSpriteInfo(data);
        }
        channel.subscribe('spriteInfo', (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}
            this.getTargetByName(d.name).postSpriteInfo(d.data);
            this.props.vm.runtime.emitProjectChanged();
        });

        let ogReorderCostume = this.props.vm.reorderCostume.bind(this.props.vm);
        this.props.vm.reorderCostume = (targetId, costumeIndex, newIndex) => {
            const spriteName = this.props.vm.runtime.getTargetById(targetId).sprite.name;
            const msg = {spriteName: spriteName, costumeIndex: costumeIndex, newIndex: newIndex, uid:nid};
            channel.publish('reorderCostume', JSON.stringify(msg));
            return ogReorderCostume(targetId, costumeIndex, newIndex);
        }
        channel.subscribe('reorderCostume', (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}
            const targetId = this.getTargetByName(d.spriteName).id;
            ogReorderCostume(targetId, d.costumeIndex, d.newIndex);
        });

        let ogReorderSound = this.props.vm.reorderSound.bind(this.props.vm);
        this.props.vm.reorderSound = (targetId, soundIndex, newIndex) => {
            const spriteName = this.props.vm.runtime.getTargetById(targetId).sprite.name;
            const msg = {spriteName: spriteName, soundIndex: soundIndex, newIndex: newIndex, uid:nid};
            channel.publish('reorderSound', JSON.stringify(msg));
            return ogReorderSound(targetId, soundIndex, newIndex);
        }
        channel.subscribe('reorderSound', (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}
            const targetId = this.getTargetByName(d.spriteName).id;
            ogReorderSound(targetId, d.soundIndex, d.newIndex);
        })

        const ogReorderTarget = this.props.vm.reorderTarget.bind(this.props.vm)
        this.props.vm.reorderTarget = (targetIndex, newIndex) => {
            const msg = {targetIndex: targetIndex, newIndex: newIndex, uid:nid};
            channel.publish('reorderTarget', JSON.stringify(msg));
            return ogReorderTarget(targetIndex, newIndex);
        }
        channel.subscribe('reorderTarget', (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}
            ogReorderTarget(d.targetIndex, d.newIndex);
        })

        // const ogVMemit = this.props.vm.runtime.emit.bind(this.props.vm.runtime)
        // this.props.vm.runtime.emit = (a1, a2) => {
        //     if (a1 == "ANSWER") {
        //         channel.publish('vmemit', JSON.stringify({a1: a1, a2: a2}));
        //     } else {
        //         ogVMemit(a1, a2);
        //     }
        // }
        // channel.subscribe('vmemit', (message) => {
        //     const d = JSON.parse(message.data);
        //     ogVMemit(d.a1, d.a2);
        // });

        const deleteSound = function (soundIndex, target) {
            const deletedSound = target.deleteSound(soundIndex);
            if (deletedSound) {
                this.runtime.emitProjectChanged();
                const restoreFun = () => {
                    target.addSound(deletedSound);
                    this.emitTargetsUpdate();
                };
                return restoreFun;
            }
            return null;
        }.bind(this.props.vm)
        //let ogDeleteSound = this.props.vm.deleteSound.bind(this.props.vm);
        this.props.vm.deleteSound = async (soundIndex) => {
            const name = this.props.vm.editingTarget.sprite.name;
            const msg = {soundIndex: soundIndex, name: name, uid: nid};
            await channel.publish('deleteSound', JSON.stringify(msg));
            return deleteSound(soundIndex, this.props.vm.editingTarget);
        }
        channel.subscribe('deleteSound', (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}
            const soundIndex = d.soundIndex;
            const target = this.getTargetByName(d.name);
            deleteSound(soundIndex, target);
        });

        this.props.vm.shareBlocksToTarget = async (blocks, target, optID) => {}

        let ogAddSound = this.props.vm.addSound.bind(this.props.vm);
        this.props.vm.addSound = async (sound, idx="AMONGUSLMAO") => {
            console.log("SOUND", sound)
            const name = idx == "AMONGUSLMAO" ? this.props.vm.editingTarget.sprite.name : this.props.vm.runtime.getTargetById(idx).sprite.name;
            const msg = {sound: sound, spriteName: name};
            return channel.publish('addSound', JSON.stringify(msg));
        }
        channel.subscribe('addSound', (message) => {
            const d = JSON.parse(message.data);
            ogAddSound(d.sound, this.getTargetByName(d.spriteName).id);
        });

        let ogRenameSound = this.props.vm.renameSound.bind(this.props.vm);
        this.props.vm.renameSound = async (soundIndex, newName) => {
            const msg = {soundIndex: soundIndex, newName: newName, spriteName: this.props.vm.editingTarget.sprite.name};
            channel.publish('renameSound', JSON.stringify(msg));
        }
        channel.subscribe('renameSound', (message) => {
            const d = JSON.parse(message.data);
            const target = this.getTargetByName(d.spriteName);
            target.renameSound(d.soundIndex, d.newName);
            this.props.vm.emitTargetsUpdate();
        })

        const deleteCostume = function(costumeIndex, target) {
            console.log("deleted costume", costumeIndex, target)
            const deletedCostume = target.deleteCostume(costumeIndex);
            if (deletedCostume) {
                this.runtime.emitProjectChanged();
                return () => {
                    target.addCostume(deletedCostume);
                    this.emitTargetsUpdate();
                };
            }
            return null;
        }.bind(this.props.vm)
        this.props.vm.deleteCostume = async (costumeIndex) => {
            const spriteName = this.props.vm.editingTarget.sprite.name
            const msg = {costumeIndex: costumeIndex, spriteName: spriteName, uid: nid};
            channel.publish('deleteCostume', JSON.stringify(msg));
            return deleteCostume(costumeIndex, this.props.vm.editingTarget);
        }
        channel.subscribe('deleteCostume', (message) => {
            const data = JSON.parse(message.data);
            if (data.uid == nid) {return}
            const costumeIndex = data.costumeIndex;
            const target = this.getTargetByName(data.spriteName)
            deleteCostume(costumeIndex, target);
        });

        // let ogAddCostumeFromLibrary = function (md5ext, costumeObject, optId=null) {
        //     // TODO: reject with an Error (possible breaking API change!)
        //     // eslint-disable-next-line prefer-promise-reject-errors
        //     if (!this.editingTarget) return Promise.reject();
        //     if (optId==null) {
        //         optId = this.editingTarget.id;
        //     }
        //     return this.addCostume(md5ext, costumeObject, optId, 2 /* optVersion */);
        // }.bind(this.props.vm)
        // this.props.vm.addCostumeFromLibrary = async (md5, costumeOBject) => {
        //     const msg = {md5: md5, costumeOBject: costumeOBject, spriteName: this.props.vm.editingTarget.sprite.name};
        //     return channel.publish('addCostumeFromLibrary', JSON.stringify(msg));
        // }
        // channel.subscribe('addCostumeFromLibrary', (message) => {
        //     const d = JSON.parse(message.data);
        //     const id = this.getTargetByName(d.spriteName).id;
        //     ogAddCostumeFromLibrary(d.md5, d.costumeOBject, id);
        // })

        let ogDupeCostume = this.props.vm.duplicateCostume.bind(this.props.vm);
        this.props.vm.duplicateCostume = async (costumeIndex) => {
            const ret = await channel.publish('duplicateCostume', JSON.stringify(costumeIndex));
            return ret;
        }
        channel.subscribe('duplicateCostume', (message) => {ogDupeCostume(JSON.parse(message.data));});

        //let ogRenameCostume = this.props.vm.renameCostume.bind(this.props.vm);
        this.props.vm.renameCostume = async (costumeIndex, newName) => {
            const spriteName = this.props.vm.editingTarget.sprite.name;
            const msg = {costumeIndex: costumeIndex, newName: newName, spriteName: spriteName};
            channel.publish('renameCostume', JSON.stringify(msg));
        }
        channel.subscribe('renameCostume', (message) => {
            const d = JSON.parse(message.data);
            this.getTargetByName(d.spriteName).renameCostume(d.costumeIndex, d.newName);
            this.props.vm.emitTargetsUpdate();
        })

        channel.subscribe('selectCostume', (message) => {
            const data = JSON.parse(message.data);
            this.getTargetByName(data.spriteName).setCostume(data.costumeIndex);
        })

        
        const decodeSvg = (data) => {
            let svgString = '';
        
            for (let i = 0; i < Object.keys(data).length; i++) {
                svgString += String.fromCharCode(data[i]);
            }
    
            return svgString;
        }
        const decodePng = (data) => {
    
            const byteNumbers = Object.values(data);
            const byteArray = new Uint8Array(byteNumbers);

            // Convert byteArray to a binary string
            let binaryString = '';
            for (let i = 0; i < byteArray.length; i += 0x8000) {
                binaryString += String.fromCharCode.apply(null, byteArray.subarray(i, i + 0x8000));
            }

            // Convert binary string to base64
            return btoa(binaryString);
    
        }

        let ogAddCostume = this.props.vm.addCostume.bind(this.props.vm);
        this.props.vm.addCostume = function(md5, costumeObject, optTarget, optVersion) {

            if (this.hasLoadedFully) {

                if (costumeObject.asset == undefined) {
                    const spriteName = optTarget ? this.props.vm.runtime.getTargetById(optTarget).sprite.name : this.props.vm.editingTarget.sprite.name;
                    // no asset locally either -> nothing heavy to strip, safe as-is
                    const msg = {md5: md5, costumeObject: costumeObject, spriteName: spriteName, optVersion: optVersion, uid:nid};
                    channel.publish('addCostume', JSON.stringify(msg))
                    return ogAddCostume(md5, costumeObject, optTarget, optVersion);
                }

                var fileContent, contentType;
                if (costumeObject.dataFormat === 'svg') {
                    fileContent = decodeSvg(costumeObject.asset.data);
                    contentType = 'image/svg+xml';
                } else {
                    fileContent = decodePng(costumeObject.asset.data);
                    contentType = 'image/png';
                }

                fetch("https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/images?fileName=" + md5 + "&cd=attachment", {
                    method: 'POST',
                    headers: {
                        'Accept': '*/*',
                        'Connection': 'keep-alive',
                        'Content-Type': contentType,
                        'Content-Disposition': 'attachment',
                    },
                    body: fileContent,
                }).then((resp) => {
                    const spriteName = optTarget ? this.props.vm.runtime.getTargetById(optTarget).sprite.name : this.props.vm.editingTarget.sprite.name;

                    // Strip the raw pixel/svg data out of the broadcast payload.
                    // It's already durably stored via the upload above (by md5),
                    // so ogAddCostume on the receiving end can rehydrate it the
                    // same way it would for the "no local asset" branch above.
                    const {asset, ...costumeObjectMeta} = costumeObject;
                    const msg = {md5: md5, costumeObject: costumeObjectMeta, spriteName: spriteName, optVersion: optVersion, uid: nid};
                    channel.publish('addCostume', JSON.stringify(msg));
                });
            }
            return ogAddCostume(md5, costumeObject, optTarget, optVersion);
        }.bind(this)

        channel.subscribe('addCostume', async (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}

            console.log("ADDING COSTUME", d)
            const targetId = this.getTargetByName(d.spriteName).id;

            // d.costumeObject.asset is intentionally absent here — same code
            // path as the "costumeObject.asset == undefined" case, which already
            // works, and now resolves the image from the CDN/storage layer by md5
            // instead of from an inline payload.
            ogAddCostume(d.md5, d.costumeObject, targetId, d.optVersion);
        })

        // this.props.vm.createVariable = function(id,name,type,isCloud) {
        //     console.log("VARIABLE MADE")
        //     // const msg = {id: id, name: name, type: type, isCloud: isCloud};
        //     // return channel.publish('createVariable', JSON.stringify(msg));
        // }

        const ogRenameVarById = this.workspace.renameVariableById.bind(this.workspace);
        this.workspace.renameVariableById = function(id, newName) {
            const msg = {id: id, newName: newName};
            channel.publish('renameVarById', JSON.stringify(msg));
        }
        channel.subscribe('renameVarById', (message) => {
            const d = JSON.parse(message.data);
            ogRenameVarById(d.id, d.newName);
        })

        const ogDeleteVarById = this.workspace.deleteVariableById.bind(this.workspace);
        this.workspace.deleteVariableById = function(id) {
            channel.publish('deleteVarById', JSON.stringify(id));
        }
        channel.subscribe('deleteVarById', (message) => {
            ogDeleteVarById(JSON.parse(message.data));
        })

        const ogDeleteVarInternal = this.workspace.deleteVariableInternal_.bind(this.workspace);
        this.workspace.deleteVariableInternal_ = function(variable, uses) {
            const msg = {variable: variable, uses: uses};
            channel.publish('deleteVarInternal', JSON.stringify(msg));
        }
        channel.subscribe('deleteVarInternal', (message) => {
            const d = JSON.parse(message.data);
            ogDeleteVarInternal(d.variable, d.uses);
        })

        this.workspace.undo = function(redo) {
            return
            var inputStack = redo ? this.workspace.redoStack_ : this.workspace.undoStack_;
            var outputStack = redo ? this.workspace.undoStack_ : this.workspace.redoStack_;
            var inputEvent = inputStack.pop();
            if (!inputEvent) {
                return;
            }
            var events = [inputEvent];
            // Do another undo/redo if the next one is of the same group.
            while (inputStack.length && inputEvent.group &&
                inputEvent.group == inputStack[inputStack.length - 1].group) {
                events.push(inputStack.pop());
            }
            // Push these popped events on the opposite stack.
            for (var i = 0, event; event = events[i]; i++) {
                outputStack.push(event);
            }
            events = this.ScratchBlocks.Events.filter(events, redo);
            this.ScratchBlocks.Events.recordUndo = false;
            if (this.ScratchBlocks.selected) {
                this.ScratchBlocks.Events.disable();
                try {
                    this.ScratchBlocks.selected.unselect();
                } finally {
                    this.ScratchBlocks.Events.enable();
                }
            }
            try {
                var emissionArray = []
                for (var i = 0, event; event = events[i]; i++) {
                    emissionArray.push(event.toJson());
                }
                this.sendArray(emissionArray, -1, -1, redo);
                for (var i = 0, event; event = events[i]; i++) {
                    event.run(redo);
                }
            } finally {
                this.ScratchBlocks.Events.recordUndo = true;
            }
        }.bind(this);

        const ogCreateVar = this.workspace.createVariable.bind(this.workspace);
        this.workspace.createVariable = function(name, opt_type, opt_id, opt_isLocal, opt_isCloud) {
            //console.log("VARIABLE MADE", name)
            const msg = {name: name, opt_type: opt_type, opt_id: opt_id, opt_isLocal: opt_isLocal, opt_isCloud: opt_isCloud, uid:nid};
            channel.publish('createVariable', JSON.stringify(msg));
            return ogCreateVar(name, opt_type, opt_id, opt_isLocal, opt_isCloud);
        }
        channel.subscribe('createVariable', (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}
            ogCreateVar(d.name, d.opt_type, d.opt_id, d.opt_isLocal, d.opt_isCloud);
        })

        // TODO: handle right click events
        const ogShowContextMenu = this.ScratchBlocks.ContextMenu.show.bind(this.ScratchBlocks.ContextMenu);
        this.ScratchBlocks.ContextMenu.show = function(a,arrayOfChoices,c) {

            const newChoices = []
            for (let i = 0; i < arrayOfChoices.length; i++) {
                const choice = arrayOfChoices[i];
                if (choice.text == "Add Comment") {
                    newChoices.push(choice)
                }
            }

            ogShowContextMenu(a,newChoices,c);
            console.log("CONTEXT MENU", a,arrayOfChoices,c)
        }

        // this.workspace.prototype.createVariable = function(id,name,sf,type,isCloud) {
        //     console.log("MADE VARIABLE")
        // }

        
        this.props.vm.updateBitmap = function(costumeIndex, bitmap, rotationCenterX, rotationCenterY, bitmapResolution, targetName = "") {
            var target;
            if (targetName == "") {
                target = this.editingTarget;
            } else if (targetName == "Stage") {
                target = this.runtime.getTargetForStage();
            } else {
                target = this.runtime.getSpriteTargetByName(targetName);
            }
            const costume = target.getCostumes()[costumeIndex];
            if (!(costume && this.runtime && this.runtime.renderer)) return;
            if (costume && costume.broken) delete costume.broken;
    
            costume.rotationCenterX = rotationCenterX;
            costume.rotationCenterY = rotationCenterY;
    
            // If the bitmap originally had a zero width or height, use that value
            const bitmapWidth = bitmap.sourceWidth === 0 ? 0 : bitmap.width;
            const bitmapHeight = bitmap.sourceHeight === 0 ? 0 : bitmap.height;
            // @todo: updateBitmapSkin does not take ImageData
            const canvas = document.createElement('canvas');
            canvas.width = bitmapWidth;
            canvas.height = bitmapHeight;
            const context = canvas.getContext('2d');
            context.putImageData(bitmap, 0, 0);
    
            // Divide by resolution because the renderer's definition of the rotation center
            // is the rotation center divided by the bitmap resolution
            this.runtime.renderer.updateBitmapSkin(
                costume.skinId,
                canvas,
                bitmapResolution,
                [rotationCenterX / bitmapResolution, rotationCenterY / bitmapResolution]
            );
    
            // @todo there should be a better way to get from ImageData to a decodable storage format
            return new Promise(resolve => {
                canvas.toBlob(blob => {
                    // Bitmaps with a zero width or height return null for their blob.
                    // Keep the existing asset metadata in this edge case.
                    if (!blob) {
                        this.emitTargetsUpdate();
                        resolve(costume.assetId);
                        return;
                    }

                    const reader = new FileReader();
                    reader.addEventListener('loadend', () => {
                        try {
                            const storage = this.runtime.storage;
                            costume.dataFormat = storage.DataFormat.PNG;
                            costume.bitmapResolution = bitmapResolution;
                            costume.size = [bitmapWidth, bitmapHeight];
                            costume.asset = storage.createAsset(
                                storage.AssetType.ImageBitmap,
                                costume.dataFormat,
                                new Uint8Array(reader.result),
                                null, // id
                                true // generate md5
                            );
                            costume.assetId = costume.asset.assetId;
                            costume.md5 = `${costume.assetId}.${costume.dataFormat}`;
                            costume.md5ext = costume.md5;
                            this.emitTargetsUpdate();
                            resolve(costume.assetId);
                        } catch (e) {
                            console.error('updateBitmap asset creation failed', e);
                            resolve(costume.assetId);
                        }
                    });
                    reader.addEventListener('error', () => resolve(costume.assetId));
                    reader.readAsArrayBuffer(blob);
                });
            });
        }.bind(this.props.vm);

        this.props.vm.updateSvg = function (costumeIndex, svg, rotationCenterX, rotationCenterY, targetName = "") {
            var target;
            console.log(targetName)
            if (targetName == "")
                target = this.editingTarget
            else if (targetName == "Stage")
                target = this.runtime.getTargetForStage();
            else 
                target = this.runtime.getSpriteTargetByName(targetName);
            const costume = target.getCostumes()[costumeIndex];
            if (costume && costume.broken) delete costume.broken;
            if (costume && this.runtime && this.runtime.renderer) {
                costume.rotationCenterX = rotationCenterX;
                costume.rotationCenterY = rotationCenterY;
                this.runtime.renderer.updateSVGSkin(costume.skinId, svg, [rotationCenterX, rotationCenterY]);
                costume.size = this.runtime.renderer.getSkinSize(costume.skinId);
            }
            const storage = this.runtime.storage;
            // If we're in here, we've edited an svg in the vector editor,
            // so the dataFormat should be 'svg'
            costume.dataFormat = storage.DataFormat.SVG;
            costume.bitmapResolution = 1;
            costume.asset = storage.createAsset(
                storage.AssetType.ImageVector,
                costume.dataFormat,
                (new TextEncoder()).encode(svg),
                null,
                true // generate md5
            );
            costume.assetId = costume.asset.assetId;
            costume.md5 = `${costume.assetId}.${costume.dataFormat}`;
            costume.md5ext = costume.md5;
            this.emitTargetsUpdate();
            return Promise.resolve(costume.assetId);
        }.bind(this.props.vm);

        // console.log(this.props.vm.runtime._primitives)
        // console.log(this.props.vm.runtime._hats)

        this.getRandomPosition = function() {
            const xmul = Math.abs((this.randomIndex * 2539301 + 26923) % 633280)
            const randomFloat1 = (xmul*xmul % 101) / 100;
            const randomFloat2 = (Math.abs((this.randomIndex * 49142293 - 2525382) % 626925393) % 101) / 100;
            const randomPosition = [
                480 * (randomFloat1 - 0.5),
                360 * (randomFloat2 - 0.5)
            ]
            this.randomIndex += 1
            return randomPosition
        }

        this.props.vm.runtime._primitives['motion_goto'] = function (args, util) {
            const randomPosition = this.getRandomPosition()
            const targetXY = args.TO == "_random_" ? randomPosition : this._getTargetXY(args.TO, util);
            if (targetXY) {
                util.target.setXY(targetXY[0], targetXY[1]);
            }
        }.bind(this)

        this.props.vm.runtime._primitives['motion_glideto'] = function (args, util) {
            const randomPosition = this.getRandomPosition();
            const targetXY = args.TO == "_random_" ? randomPosition : this._getTargetXY(args.TO, util);
            const glideFunc = this.props.vm.runtime._primitives['motion_glidesecstoxy']
            if (targetXY) {
                glideFunc({SECS: args.SECS, X: targetXY[0], Y:targetXY[1]}, util);
            }
        }.bind(this)

        // this.props.vm.runtime._primitives['sensing_resettimer'] = function (args, util) {
        //     debugger
        //     console.log(args, util)
        // }

        //console.log("WHAT", this.props.vm.runtime.defaultBlockPackages.scratch3_motion)
        
        const ogWResize = this.workspace.resizeContents.bind(this.workspace);
        this.workspace.resizeContents = function () {
            console.log("ASKED TO RESIZE", this.pauseWorkspaceUpdate)
            if (this.pauseWorkspaceUpdate) {
                return;
            }
            ogWResize();
        }.bind(this)

        const ogClear = this.workspace.clear.bind(this.workspace);
        this.workspace.clear = function () {
            console.log("CLEARING!", this.pauseWorkspaceUpdate)
            if (this.pauseWorkspaceUpdate) {
                return;
            }
            ogClear();
        }.bind(this)

        const ogScroll = this.workspace.scrollbar.resize.bind(this.workspace.scrollbar);
        this.workspace.scrollbar.resize = function () {
            if (this.pauseWorkspaceUpdate) {
                return;
            }
            ogScroll();
        }.bind(this)

        const ogEmitTargetsUpdate = this.props.vm.emitTargetsUpdate.bind(this.props.vm);
        this.props.vm.emitTargetsUpdate = function (boolopt) {
            if (this.pauseWorkspaceUpdate) {
                return;
            }
            ogEmitTargetsUpdate(boolopt);
        }.bind(this)
        
        const ogUpdateScroll = this.workspace.scrollbar.set.bind(this.workspace.scrollbar)
        this.workspace.scrollbar.set = function (x,y) {
            if (this.pauseWorkspaceUpdate) {
                return
            }
            ogUpdateScroll(x,y)
        }.bind(this)

        const ogRuntimeImageLoad = this.props.vm.runtime.storage.load.bind(this.props.vm.runtime.storage);
        this.props.vm.runtime.storage.load = function(a,b,c) {
            return ogRuntimeImageLoad(a,b,c);
        }

        function extractNumberFromUrl(url) {
            const baseUrl = "https://assets.scratch.mit.edu/internalapi/asset/";
            // Remove the initial part of the URL
            let trimmedUrl = url.replace(baseUrl, '');
            // Split the remaining part of the URL by '.' and get the first index
            let number = trimmedUrl.split('.')[0];
            // Return the extracted number
            return number;
        }

        const ogGet = this.props.vm.runtime.storage.webHelper.assetTool.get.bind(this.props.vm.runtime.storage.webHelper.assetTool)
        this.props.vm.runtime.storage.webHelper.assetTool.get = function({url, ...options}) {
            // const md5 = extractNumberFromUrl(url)
            // console.log("MD5", md5)
            // if (md5 != "-1") {
            //     fetch(`http://scratch-images.s3-website.us-east-2.amazonaws.com/${md5}.svg`).then((response) => {"EARNERING", console.log(response)})
            //     console.log(url)
            //     console.log(url, options)
            // }
            // fetch(url).then((response) => {"RESPONDING",console.log(response)})
            return fetch(url, Object.assign({method: 'GET', "Connection": "keep-alive", "Accept": "*/*"}, options))
                .then(result => {
                    // result.arrayBuffer().then(b => {const r = new Uint8Array(b);  console.log("MAGIK",url,b,r)})
                    if (result.ok) return result.arrayBuffer().then(b => new Uint8Array(b));
                    if (result.status === 404) return null;
                    return Promise.reject(result.status); // TODO: we should throw a proper error
                });
        }

        this.ScratchBlocks.Xml.domToBlock = function(xmlBlock, workspace) {
            //const swappingWorkspaces = this.workspace.id == workspace.id && this.pauseWorkspaceUpdate;
            //console.log("DOMTO", this.workspace.id, workspace.isFlyout, this.pauseWorkspaceUpdate, workspace)
            if (false) {
                var swap = xmlBlock;
                xmlBlock = workspace;
                workspace = swap;
                console.warn('Deprecated call to Blockly.Xml.domToBlock, ' +
                            'swap the arguments.');
            }
            // Create top-level block.
            this.ScratchBlocks.Events.disable();
            var variablesBeforeCreation = workspace.getAllVariables();
            try {
                var topBlock = this.ScratchBlocks.Xml.domToBlockHeadless_(xmlBlock, workspace);
                // Generate list of all blocks.
                var blocks = topBlock.getDescendants(false);
                if (workspace.rendered) {
                    // Hide connections to speed up assembly.
                    topBlock.setConnectionsHidden(true);
                    // Render each block.
                    // if workspace is flyout, do it
                    // if it's not, only do it if the workspace is not paused
                    if (workspace.isFlyout || !this.pauseWorkspaceUpdate) {
                        for (var i = blocks.length - 1; i >= 0; i--) {
                            blocks[i].initSvg();
                        }
                        for (var i = blocks.length - 1; i >= 0; i--) {
                            blocks[i].render(false);
                        }
                    }
                    // Populating the connection database may be deferred until after the
                    // blocks have rendered.
                    if (!workspace.isFlyout) {
                        setTimeout(function() {
                        if (topBlock.workspace) {  // Check that the block hasn't been deleted.
                            topBlock.setConnectionsHidden(false);
                        }
                        }, 1);
                    }
                    topBlock.updateDisabled();
                    // Allow the scrollbars to resize and move based on the new contents.
                    // TODO(@picklesrus): #387. Remove when domToBlock avoids resizing.
                    workspace.resizeContents();
                } else {
                    for (var i = blocks.length - 1; i >= 0; i--) {
                        blocks[i].initModel();
                    }
                }
            } finally {
                this.ScratchBlocks.Events.enable();
            }
            if (this.ScratchBlocks.Events.isEnabled()) {
              var newVariables = this.ScratchBlocks.Variables.getAddedVariables(workspace,
                  variablesBeforeCreation);
              // Fire a VarCreate event for each (if any) new variable created.
              for (var i = 0; i < newVariables.length; i++) {
                var thisVariable = newVariables[i];
                this.ScratchBlocks.Events.fire(new this.ScratchBlocks.Events.VarCreate(thisVariable));
              }
              // Block events come after var events, in case they refer to newly created
              // variables.
              this.ScratchBlocks.Events.fire(new this.ScratchBlocks.Events.BlockCreate(topBlock));
            }
            return topBlock;
          }.bind(this);

        //this.props.vm.clearFlyoutBlocks()
    }

    _getTargetXY (targetName, util) {
        let targetX = 0;
        let targetY = 0;
        if (targetName === '_mouse_') {
            targetX = util.ioQuery('mouse', 'getScratchX');
            targetY = util.ioQuery('mouse', 'getScratchY');
        } else {
            // convert targetName to a string
            targetName = String(targetName);
            const goToTarget = this.props.vm.runtime.getSpriteTargetByName(targetName);
            if (!goToTarget) return;
            targetX = goToTarget.x;
            targetY = goToTarget.y;
        }
        return [targetX, targetY];
    }

    getTargetByName(name) {
        return name == "Stage" ? this.props.vm.runtime.getTargetForStage() : this.props.vm.runtime.getSpriteTargetByName(name);
    }

    async newUserJoined(msg) {
        if (JSON.parse(msg.data).uid == nid) {
            return;
        }

        const presenceSet = await channel.presence.get();
        const syncOwner = presenceSet
            .slice()
            .sort((first, second) => {
                const firstClientId = first.clientId || '';
                const secondClientId = second.clientId || '';

                if (firstClientId < secondClientId) return -1;
                if (firstClientId > secondClientId) return 1;

                const firstConnectionId = first.connectionId || '';
                const secondConnectionId = second.connectionId || '';
                if (firstConnectionId < secondConnectionId) return -1;
                if (firstConnectionId > secondConnectionId) return 1;
                return 0;
            })[0];

        if (!syncOwner || syncOwner.clientId !== name) {
            return;
        }

        await this.save();
        console.log("JOINED!!")
        await channel.publish('goodForLoad', JSON.stringify({uid: nid}) );
        // console.log(this.props.vm.runtime.execute.blockUtility)
        // this.props.vm.runtime.execute.blockUtility.ioQuery('clock', 'resetProjectTimer')
    }

    detachVM () {
        this.props.vm.removeListener('SCRIPT_GLOW_ON', this.onScriptGlowOn);
        this.props.vm.removeListener('SCRIPT_GLOW_OFF', this.onScriptGlowOff);
        this.props.vm.removeListener('BLOCK_GLOW_ON', this.onBlockGlowOn);
        this.props.vm.removeListener('BLOCK_GLOW_OFF', this.onBlockGlowOff);
        this.props.vm.removeListener('VISUAL_REPORT', this.onVisualReport);
        this.props.vm.removeListener('workspaceUpdate', this.onWorkspaceUpdate);
        this.props.vm.removeListener('targetsUpdate', this.onTargetsUpdate);
        this.props.vm.removeListener('MONITORS_UPDATE', this.handleMonitorsUpdate);
        this.props.vm.removeListener('EXTENSION_ADDED', this.handleExtensionAdded);
        this.props.vm.removeListener('BLOCKSINFO_UPDATE', this.handleBlocksInfoUpdate);
        this.props.vm.removeListener('PERIPHERAL_CONNECTED', this.handleStatusButtonUpdate);
        this.props.vm.removeListener('PERIPHERAL_DISCONNECTED', this.handleStatusButtonUpdate);
    }

    updateToolboxBlockValue (id, value) {
        this.withToolboxUpdates(() => {
            const block = this.workspace
                .getFlyout()
                .getWorkspace()
                .getBlockById(id);
            if (block) {
                block.inputList[0].fieldRow[0].setValue(value);
            }
        });
    }

    onTargetsUpdate () {
        if (this.props.vm.editingTarget && this.workspace.getFlyout()) {
            ['glide', 'move', 'set'].forEach(prefix => {
                this.updateToolboxBlockValue(`${prefix}x`, Math.round(this.props.vm.editingTarget.x).toString());
                this.updateToolboxBlockValue(`${prefix}y`, Math.round(this.props.vm.editingTarget.y).toString());
            });
        }
    }
    onWorkspaceMetricsChange () {
        const target = this.props.vm.editingTarget;
        if (target && target.id) {
            // Dispatch updateMetrics later, since onWorkspaceMetricsChange may be (very indirectly)
            // called from a reducer, i.e. when you create a custom procedure.
            // TODO: Is this a vehement hack?
            setTimeout(() => {
                this.props.updateMetrics({
                    targetID: target.id,
                    scrollX: this.workspace.scrollX,
                    scrollY: this.workspace.scrollY,
                    scale: this.workspace.scale
                });
            }, 0);
        }
    }
    onScriptGlowOn (data) {
        this.workspace.glowStack(data.id, true);
    }
    onScriptGlowOff (data) {
        this.workspace.glowStack(data.id, false);
    }
    onBlockGlowOn (data) {
        this.workspace.glowBlock(data.id, true);
    }
    onBlockGlowOff (data) {
        this.workspace.glowBlock(data.id, false);
    }
    onVisualReport (data) {
        this.workspace.reportValue(data.id, data.value);
    }
    getToolboxXML () {
        // Use try/catch because this requires digging pretty deep into the VM
        // Code inside intentionally ignores several error situations (no stage, etc.)
        // Because they would get caught by this try/catch
        try {
            let {editingTarget: target, runtime} = this.props.vm;
            const stage = runtime.getTargetForStage();
            if (!target) target = stage; // If no editingTarget, use the stage

            const stageCostumes = stage.getCostumes();
            const targetCostumes = target.getCostumes();
            const targetSounds = target.getSounds();
            const dynamicBlocksXML = injectExtensionCategoryTheme(
                this.props.vm.runtime.getBlocksXML(target),
                this.props.theme
            );
            return makeToolboxXML(false, target.isStage, target.id, dynamicBlocksXML,
                targetCostumes[targetCostumes.length - 1].name,
                stageCostumes[stageCostumes.length - 1].name,
                targetSounds.length > 0 ? targetSounds[targetSounds.length - 1].name : '',
                getColorsForTheme(this.props.theme)
            );
        } catch {
            return null;
        }
    }
    onWorkspaceUpdate (data) {
        // While pauseWorkspaceUpdate is set, this call is a private "peek" at
        // another target's blocks during a remote-sync target swap (see
        // withTargetContext), not a real UI-visible target switch. The
        // toolbox/metrics dispatches below push state into Redux and can
        // trigger a synchronous React re-render (Redux dispatches outside a
        // React event handler aren't batched) -- only meaningful, and only
        // safe, once we're actually showing the user's own target again.
        // Letting these fire mid-peek was harmless when the peek window was
        // ~1ms; widening it (needed elsewhere so a deferred blockListener
        // notification has time to land) made a stray mid-swap re-render
        // likely enough to race the swap-back and leave the workspace
        // scrolled away from its blocks, looking empty.
        if (!this.pauseWorkspaceUpdate) {
            const toolboxXML = this.getToolboxXML();
            if (toolboxXML) {
                this.props.updateToolboxState(toolboxXML);
            }

            if (this.props.vm.editingTarget && !this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {
                this.onWorkspaceMetricsChange();
            }

            sessionStorage.setItem('editingTarget', this.props.vm.editingTarget.sprite.name);
        }

        this.workspace.removeChangeListener(this.props.vm.blockListener);
        this.workspace.removeChangeListener(this.sendChangeListener);
        const dom = this.ScratchBlocks.Xml.textToDom(data.xml);

        // IMPORTANT: clear+load must always run as a pair, even during a
        // temporary target swap (pauseWorkspaceUpdate === true), otherwise
        // the overridden workspace.clear() below becomes a no-op and the
        // newly-loaded XML gets stacked on top of the existing blocks,
        // producing duplicate/corrupted blocks with colliding IDs.
        const wasPaused = this.pauseWorkspaceUpdate;
        this.pauseWorkspaceUpdate = false;
        try {
            this.ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, this.workspace);
        } catch (error) {
            if (error.message) {
                error.message = `Workspace Update Error: ${error.message}`;
            }
            log.error(error);
        } finally {
            this.pauseWorkspaceUpdate = wasPaused;
        }

        this.workspace.addChangeListener(this.props.vm.blockListener);
        this.workspace.addChangeListener(this.sendChangeListener);

        if (!this.pauseWorkspaceUpdate && this.props.vm.editingTarget && this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {
            const {scrollX, scrollY, scale} = this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id];
            this.workspace.scrollX = scrollX;
            this.workspace.scrollY = scrollY;
            this.workspace.scale = scale;
            this.workspace.resize();
        }

        this.workspace.clearUndo();
    }
    handleMonitorsUpdate (monitors) {
        // Update the checkboxes of the relevant monitors.
        // TODO: What about monitors that have fields? See todo in scratch-vm blocks.js changeBlock:
        // https://github.com/LLK/scratch-vm/blob/2373f9483edaf705f11d62662f7bb2a57fbb5e28/src/engine/blocks.js#L569-L576
        const flyout = this.workspace.getFlyout();
        for (const monitor of monitors.values()) {
            const blockId = monitor.get('id');
            const isVisible = monitor.get('visible');
            flyout.setCheckboxState(blockId, isVisible);
            // We also need to update the isMonitored flag for this block on the VM, since it's used to determine
            // whether the checkbox is activated or not when the checkbox is re-displayed (e.g. local variables/blocks
            // when switching between sprites).
            const block = this.props.vm.runtime.monitorBlocks.getBlock(blockId);
            if (block) {
                block.isMonitored = isVisible;
            }
        }
    }
    handleExtensionAdded (categoryInfo) {
        const defineBlocks = blockInfoArray => {
            if (blockInfoArray && blockInfoArray.length > 0) {
                const staticBlocksJson = [];
                const dynamicBlocksInfo = [];
                blockInfoArray.forEach(blockInfo => {
                    if (blockInfo.info && blockInfo.info.isDynamic) {
                        dynamicBlocksInfo.push(blockInfo);
                    } else if (blockInfo.json) {
                        staticBlocksJson.push(injectExtensionBlockTheme(blockInfo.json, this.props.theme));
                    }
                    // otherwise it's a non-block entry such as '---'
                });

                this.ScratchBlocks.defineBlocksWithJsonArray(staticBlocksJson);
                dynamicBlocksInfo.forEach(blockInfo => {
                    // This is creating the block factory / constructor -- NOT a specific instance of the block.
                    // The factory should only know static info about the block: the category info and the opcode.
                    // Anything else will be picked up from the XML attached to the block instance.
                    const extendedOpcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
                    const blockDefinition =
                        defineDynamicBlock(this.ScratchBlocks, categoryInfo, blockInfo, extendedOpcode);
                    this.ScratchBlocks.Blocks[extendedOpcode] = blockDefinition;
                });
            }
        };

        // scratch-blocks implements a menu or custom field as a special kind of block ("shadow" block)
        // these actually define blocks and MUST run regardless of the UI state
        defineBlocks(
            Object.getOwnPropertyNames(categoryInfo.customFieldTypes)
                .map(fieldTypeName => categoryInfo.customFieldTypes[fieldTypeName].scratchBlocksDefinition));
        defineBlocks(categoryInfo.menus);
        defineBlocks(categoryInfo.blocks);

        // Update the toolbox with new blocks if possible
        const toolboxXML = this.getToolboxXML();
        if (toolboxXML) {
            this.props.updateToolboxState(toolboxXML);
        }
    }
    handleBlocksInfoUpdate (categoryInfo) {
        // @todo Later we should replace this to avoid all the warnings from redefining blocks.
        this.handleExtensionAdded(categoryInfo);
    }
    handleCategorySelected (categoryId) {
        console.log("ARAIREORE")
        channel.publish('categorySelected', JSON.stringify(categoryId));
    }
    parseCategorySelected (msg) {
        const categoryId = JSON.parse(msg.data);
        const extension = extensionData.find(ext => ext.extensionId === categoryId);
        if (extension && extension.launchPeripheralConnectionFlow) {
            this.handleConnectionModalStart(categoryId);
        }

        this.withToolboxUpdates(() => {
            this.workspace.toolbox_.setSelectedCategoryById(categoryId);
        });
    }
    setBlocks (blocks) {
        this.blocks = blocks;
    }

    handlePromptStart (message, defaultValue, callback, optTitle, optVarType) {
        
    //     const msg = {message:message, defaultValue:defaultValue, optTitle:optTitle, optVarType:optVarType};
    //     await channel.publish('promptStart', JSON.stringify(msg));
    // }
    // handlePrompt(msg) {
    //     const callback = this.ScratchBlocks.Variables.createVariable
    //     const {message, defaultValue, optTitle, optVarType} = JSON.parse(msg.data);
        const p = {prompt: {callback, message, defaultValue}};
        p.prompt.title = optTitle ? optTitle :
            this.ScratchBlocks.Msg.VARIABLE_MODAL_TITLE;
        p.prompt.varType = typeof optVarType === 'string' ?
            optVarType : this.ScratchBlocks.SCALAR_VARIABLE_TYPE;
        p.prompt.showVariableOptions = // This flag means that we should show variable/list options about scope
            optVarType !== this.ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE &&
            p.prompt.title !== this.ScratchBlocks.Msg.RENAME_VARIABLE_MODAL_TITLE &&
            p.prompt.title !== this.ScratchBlocks.Msg.RENAME_LIST_MODAL_TITLE;
        p.prompt.showCloudOption = (optVarType === this.ScratchBlocks.SCALAR_VARIABLE_TYPE) && this.props.canUseCloud;
        this.setState(p);
    }
    handleConnectionModalStart (extensionId) {
        this.props.onOpenConnectionModal(extensionId);
    }
    handleStatusButtonUpdate () {
        this.ScratchBlocks.refreshStatusButtons(this.workspace);
    }
    handleOpenSoundRecorder () {
        this.props.onOpenSoundRecorder();
    }

    /*
     * Pass along information about proposed name and variable options (scope and isCloud)
     * and additional potentially conflicting variable names from the VM
     * to the variable validation prompt callback used in scratch-blocks.
     */
    
    handlePromptCallback (input, variableOptions) {
        
        // const kkk = function(d,e,k){k=k||{};var g="local"===k.scope||!1;k=k.isCloud||!1;e=e||[];if(d=f(d,a,g?[]:e,k,b)){var h;a.getPotentialVariableMap()&&c&&(h=Blockly.Variables.realizePotentialVar(d,c,a,!1));h||(h=a.createVariable(d,c,null,g,k));g=a.isFlyout?a:a.getFlyout();h=h.getId();g.setCheckboxState&&g.setCheckboxState(h,!0);b&&b(h);}else b&&b(null);};kkk("fdsafsd","my variable",{"scope":"global","isCloud":false})
        // console.log(variableOptions, JSON.stringify(variableOptions))
        // console.log("const kkk = " + this.state.prompt.callback.toString()+`kkk(${input},${this.props.vm.runtime.getAllVarNamesOfType(this.state.prompt.varType)},${JSON.stringify(variableOptions)})`)
        // console.log(eval("const kkk = " + this.state.prompt.callback.toString()+`;kkk("${input}","${this.props.vm.runtime.getAllVarNamesOfType(this.state.prompt.varType)}",${JSON.stringify(variableOptions)})`))
        // console.log(this.state.prompt.callback, this.ScratchBlocks.Variables.createVariable, input, variableOptions)
        this.state.prompt.callback(
            input,
            this.props.vm.runtime.getAllVarNamesOfType(this.state.prompt.varType),
            variableOptions);
        this.handlePromptClose();
    }
    handlePromptClose () {
        this.setState({prompt: null});
    }
    handleCustomProceduresClose (data) {
        this.props.onRequestCloseCustomProcedures(data);
        const ws = this.workspace;
        ws.refreshToolboxSelection_();
        ws.toolbox_.scrollToCategoryById('myBlocks');
    }
    handleDrop (dragInfo) {
        fetch(dragInfo.payload.bodyUrl)
            .then(response => response.json())
            .then(blocks => this.props.vm.shareBlocksToTarget(blocks, this.props.vm.editingTarget.id))
            .then(() => {
                this.props.vm.refreshWorkspace();
                this.updateToolbox(); // To show new variables/custom blocks
            });
    }
    render () {

        /* eslint-disable no-unused-vars */
        const {
            anyModalVisible,
            canUseCloud,
            customProceduresVisible,
            extensionLibraryVisible,
            options,
            stageSize,
            vm,
            isRtl,
            isVisible,
            onActivateColorPicker,
            onOpenConnectionModal,
            onOpenSoundRecorder,
            updateToolboxState,
            onActivateCustomProcedures,
            onRequestCloseExtensionLibrary,
            onRequestCloseCustomProcedures,
            toolboxXML,
            updateMetrics: updateMetricsProp,
            useCatBlocks,
            workspaceMetrics,
            ...props
        } = this.props;
        console.log("PROPS", this.props)
        /* eslint-enable no-unused-vars */
        return (
            <React.Fragment>
                <DroppableBlocks 
                    componentRef={this.setBlocks}
                    onDrop={this.handleDrop}
                    {...props}
                />
                {this.state.prompt ? (
                    <Prompt
                        defaultValue={this.state.prompt.defaultValue}
                        isStage={vm.runtime.getEditingTarget().isStage}
                        showListMessage={this.state.prompt.varType === this.ScratchBlocks.LIST_VARIABLE_TYPE}
                        label={this.state.prompt.message}
                        showCloudOption={this.state.prompt.showCloudOption}
                        showVariableOptions={this.state.prompt.showVariableOptions}
                        title={this.state.prompt.title}
                        vm={vm}
                        onCancel={this.handlePromptClose}
                        onOk={this.handlePromptCallback}
                    />
                ) : null}
                {false ? (
                    <ExtensionLibrary
                        vm={vm}
                        onCategorySelected={this.handleCategorySelected}
                        onRequestClose={onRequestCloseExtensionLibrary}
                    />
                ) : null}
                {customProceduresVisible ? (
                    <CustomProcedures
                        options={{
                            media: options.media
                        }}
                        onRequestClose={this.handleCustomProceduresClose}
                    />
                ) : null}
            </React.Fragment>
        );
    }
}

Blocks.propTypes = {
    anyModalVisible: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    customProceduresVisible: PropTypes.bool,
    extensionLibraryVisible: PropTypes.bool,
    isRtl: PropTypes.bool,
    isVisible: PropTypes.bool,
    locale: PropTypes.string.isRequired,
    messages: PropTypes.objectOf(PropTypes.string),
    onActivateColorPicker: PropTypes.func,
    onActivateCustomProcedures: PropTypes.func,
    onOpenConnectionModal: PropTypes.func,
    onOpenSoundRecorder: PropTypes.func,
    onRequestCloseCustomProcedures: PropTypes.func,
    onRequestCloseExtensionLibrary: PropTypes.func,
    options: PropTypes.shape({
        media: PropTypes.string,
        zoom: PropTypes.shape({
            controls: PropTypes.bool,
            wheel: PropTypes.bool,
            startScale: PropTypes.number
        }),
        comments: PropTypes.bool,
        collapse: PropTypes.bool
    }),
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    theme: PropTypes.oneOf(Object.keys(themeMap)),
    toolboxXML: PropTypes.string,
    updateMetrics: PropTypes.func,
    updateToolboxState: PropTypes.func,
    useCatBlocks: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired,
    workspaceMetrics: PropTypes.shape({
        targets: PropTypes.objectOf(PropTypes.object)
    })
};

Blocks.defaultOptions = {
    zoom: {
        controls: true,
        wheel: true,
        startScale: BLOCKS_DEFAULT_SCALE
    },
    grid: {
        spacing: 40,
        length: 2,
        colour: '#999'
    },
    comments: true,
    collapse: false,
    sounds: false
};

Blocks.defaultProps = {
    isVisible: true,
    options: Blocks.defaultOptions,
    theme: DEFAULT_THEME
};

const mapStateToProps = state => ({
    anyModalVisible: (
        Object.keys(state.scratchGui.modals).some(key => state.scratchGui.modals[key]) ||
        state.scratchGui.mode.isFullScreen
    ),
    extensionLibraryVisible: state.scratchGui.modals.extensionLibrary,
    isRtl: state.locales.isRtl,
    locale: state.locales.locale,
    messages: state.locales.messages,
    toolboxXML: state.scratchGui.toolbox.toolboxXML,
    customProceduresVisible: state.scratchGui.customProcedures.active,
    workspaceMetrics: state.scratchGui.workspaceMetrics,
    useCatBlocks: isTimeTravel2020(state)
});

const mapDispatchToProps = dispatch => ({
    onActivateColorPicker: callback => dispatch(activateColorPicker(callback)),
    onActivateCustomProcedures: (data, callback) => dispatch(activateCustomProcedures(data, callback)),
    onOpenConnectionModal: id => {
        dispatch(setConnectionModalExtensionId(id));
        dispatch(openConnectionModal());
    },
    onOpenSoundRecorder: () => {
        dispatch(activateTab(SOUNDS_TAB_INDEX));
        dispatch(openSoundRecorder());
    },
    onRequestCloseExtensionLibrary: () => {
        dispatch(closeExtensionLibrary());
    },
    onRequestCloseCustomProcedures: data => {
        dispatch(deactivateCustomProcedures(data));
    },
    updateToolboxState: toolboxXML => {
        dispatch(updateToolbox(toolboxXML));
    },
    updateMetrics: metrics => {
        dispatch(updateMetrics(metrics));
    }
});

export default errorBoundaryHOC('Blocks')(
    connect(
        mapStateToProps,
        mapDispatchToProps
    )(Blocks)
);