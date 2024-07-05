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
import {ablySpace, ablyInstance} from "../utils/AblyHandlers.jsx";
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

const s3Client = new AWS.S3();
const nid = nanoid();
const ably = ablyInstance;
const channel = ably.channels.get(ablySpace);
let hasInited = false;
let flag1 = false;
let flag2 = false;

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

        setInterval(() => {
            if (this.queue.length == 1 && this.queue[0].type == "move") {
                //console.log("blah")
                const ev = this.ScratchBlocks.Events.fromJson(this.queue[0], this.workspace)
                ev.recordUndo = true;
                this.sendInformation(ev);
                this.queue.length = 0;
            }
            const scale = this.workspace.scale / 0.675
            const dragRelative = {x: this.workspace.scrollX * scale, y: this.workspace.scrollY * scale}
            if (sessionStorage.getItem("dragRelative") != JSON.stringify(dragRelative)) {
                //console.log("dragged", dragRelative)
                sessionStorage.setItem("dragRelative", JSON.stringify(dragRelative));
            }
        }, 35); 

        setInterval(() => {
            this.save();
        }, 5 * 60 * 1000); 

        console.log("constructed");

    }

    componentDidMount () {
        
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
            (() => this.ScratchBlocks.Variables.createVariable(this.workspace, null, type));
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

        // Clear the flyout blocks so that they can be recreated on mount.
        this.props.vm.clearFlyoutBlocks();
        window.removeEventListener('resize', this.updateDimensions);
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

    async initInformation() {
        if (!hasInited) {
            this.hasLoadedFully = false;
            this.hasLoadedInitially = false;
            this.queueWorkspaceUpdate = false
            this.pauseWorkspaceUpdate = false;
            this.queueFurtherSends = false;
            this.stopEmission = false;
            this.holdingBlock = false;
            this.lastBlockId = "";
            this.lastBlockType = "";
            this.lastTempId = ""
            this.randomIndex = 0;
            hasInited = true;

            this.varCallbackFunc = function(a,b,c) {console.log(a,b,c, "callback var trigged early")};

            this.backlog = [];
            this.queue = [];
            //this.blocks = [];
            this.idToAll = {};
            this.amountOfBlocks = 0;

            await ably.connection.once("connected");
            console.log("connected to Ably");

            await channel.subscribe('event', (message) => this.recieveInformation(message));
            //await channel.subscribe('onSelect', (message) => this.spriteOnSelect(message));
            await channel.subscribe('imageUpdated', (message) => this.imageUpdated(message))
            await channel.subscribe('renameCostume', (message) => {
                const data = JSON.parse(message.data);
                this.props.vm.renameCostume(data.costumeIndex, data.name);
            });
            await channel.subscribe('newJoin', this.newUserJoined.bind(this))
            await channel.subscribe('goodForLoad', (msg) => {
                if (!this.hasLoadedInitially) {
                    this.load();
                    this.hasLoadedInitially = true;
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

            console.log("prescence", presenceSet)
            
            if (presenceSet.length > 0) {
                //console.log("presence set", presenceSet)
                await channel.subscribe('goodForLoad', async (msg) => {
                    if (!this.hasLoadedInitially) {
                        await this.load();
                        this.hasLoadedInitially = true;
                    }
                })
                await channel.publish('newJoin', JSON.stringify({uid: nid}));
            } else {
                await this.load();
            }
            
            await channel.presence.enter() 

            this.hasLoadedFully = true;
                
        }
    }

    async spriteOnSelect(msg) {
        //if (blockEmission) {return}
        
        const data = JSON.parse(msg.data)
        let id = data.num;
        console.log('ablySDFSDF', data, id)
        const eventInfo = data.data;
        
        this.stopEmission = true;
        console.log(JSON.stringify(eventInfo));
        this.props.vm.addSprite(JSON.stringify(eventInfo)).then(() => {
            this.props.onActivateBlockTab(0);
        });
        this.stopEmission = false;
    }

    async imageUpdated(msg) {
        const data = JSON.parse(msg.data);
        
        const image = data.image;
        const rotationCenterX = data.rotationCenterX;
        const rotationCenterY = data.rotationCenterY;
        const isVector = data.isVector;
        const costumeIndex = data.selectedIdx;

        if (isVector) {
            this.props.vm.updateSvg(
                costumeIndex,
                image,
                rotationCenterX,
                rotationCenterY,
                data.editingTarget
            );
        } else {
            this.props.vm.updateBitmap(
                costumeIndex,
                image,
                rotationCenterX,
                rotationCenterY,
                2 /* bitmapResolution */
            );
        }
        

        const target = this.props.vm.editingTarget
        const assetId = target.sprite['costumes'][costumeIndex].assetId
        const targetURL = `https://rqzsni63s5.execute-api.us-east-2.amazonaws.com/scratch/images?fileName=${assetId}.svg`
        const res = await fetch(targetURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'image/svg+xml'
            },
            body: image
        });
        const res2 = await fetch("https://rqzsni63s5.execute-api.us-east-2.amazonaws.com/scratch/assetID",{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: `[${JSON.stringify({
                assetID: assetId,
                isCustom: "True"
            })}]`
        })
        console.log(res2)
        console.log('post',assetId)

    }

    async load() {

        try {
            this.stopEmission = true;

            //const decoder = 
            const response = await fetch("https://rqzsni63s5.execute-api.us-east-2.amazonaws.com/scratch/s3-storage?space="+ablySpace,{
                method: 'GET'
            })
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                chunks.push(value);
            }
            const concatenated = new Uint8Array(chunks.reduce((acc, chunk) => acc.concat(Array.from(chunk)), []));
            const jsonString = decoder.decode(concatenated);
            const data = JSON.parse(jsonString);
            await this.props.vm.loadProject(data);

            //this.props.vm.editingTarget.setCostume(1);
        } catch (error) {
            console.error('Error fetching data from S3:', error);
        }

        // this.props.vm.editingTarget = this.props.vm.runtime.getSpriteTargetByName("Apple");
        // this.props.vm.editingTarget = this.props.vm.runtime.getSpriteTargetByName("Taco");

        this.stopEmission = false;

        return
        
    }

    ret(){return 3;}

    async save() {

        const s = JSON.stringify(this.props.vm.toJSON())
        console.log("SAVED!!!")
        
        await fetch('https://rqzsni63s5.execute-api.us-east-2.amazonaws.com/scratch/s3-storage', {
            method: 'POST',
            body: ablySpace+"~|@^|@|~"+s
        });

    }
 
    // heavily edited from https://github.com/BlockliveScratch/Blocklive/blob/master/extension/scripts/editor.js#L834

    async sendInformation(eve) {

        let parentID = -1;
        let childIDX = -1;

        // handing field events since they don't have a consistent blockId
        if (eve.element == "field") {
            const parentBlock = this.workspace.getBlockById(eve.blockId).parentBlock_;
            if (!!parentBlock) {
                parentID = parentBlock.id;
                for (let childBlock of parentBlock.childBlocks_) {
                    if (childBlock.id == eve.blockId) {
                        childIDX = parentBlock.childBlocks_.indexOf(childBlock);
                    }
                }
            }
        }

        if (this.stopEmission) {
            //console.log("Stopped emission")
            if (this.lastBlockId == eve.blockId && this.lastBlockType == eve.type) {
                this.stopEmission = false;
                if (this.lastTempId != "") {
                    this.revertToOriginalTarget();
                    this.lastTempId = ""
                }
            }
            return;
        }
        if (this.holdingBlock) {return;}
        //console.log(eve.element, eve.recordUndo, eve.group, eve)
        
        if ( !(eve.element == "click" || eve.element == "stackclick" || eve.element == "field") ) {
            if ( (eve.group == "" || !eve.recordUndo) ) {
                return;
            }
        }


        // this is if an event happens while an event is being sent to the server;
        // we queue the event to be sent after the current event is sent
        // this is not correlated with the other this.queue system
        let singleMessage = eve.toJson();

        if (this.queueFurtherSends || this.queueWhileOnDifferentTarget) {
            console.log("backlogged", singleMessage)
            this.backlog.push(singleMessage);
            return;
        }

        // we queue moves because they can follow other moves to snap blocks together and we want to send these together
        // to avoid visual artifacts
        if (eve.type == "move") {
            if (this.queue.length == 0) {
                // debugger
                console.log(singleMessage, "queueing move")
                this.queue.push(singleMessage);
                return;
            }
        }
        
        // we queue the create event because it has to immediately be moved after
        if (eve.type == "create" || eve.element == "click") {
            console.log(singleMessage, eve.type == "create" ? "queueing create" : "queueing other");
            this.queue.push(singleMessage);
            return;
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
        
        //console.log(this.queue, this.queue.length, "sending");
        this.queue.push(singleMessage);
        console.log('pushing to queue', singleMessage)
        //console.log(this.queue, this.queue.length, "sending");
        
        console.log('sending array of length: ', this.queue.length)

        await this.sendArray(this.queue, parentID, childIDX);

        this.queue.length = 0;
        
        console.log("sending backlog:", this.backlog )

        await this.sendBacklog(parentID, childIDX);

        //this.save.bind(this)();
        
    }

    async sendArray(arr, parentID=-1, childIDX=-1) {
        const message = {
            uid: nid,
            target: this.props.vm.editingTarget.sprite.name,
            messages: arr,
            parentID: parentID,
            childIDX: childIDX,
            rIDX: this.randomIndex
        }

        console.log("sending array", message)
        this.queueFurtherSends = true;
        await channel.publish('event', JSON.stringify(message));
        this.queueFurtherSends = false;
    }

    enableEmission() {
        if (this.stopEmission) {
            // this.stopEmission = false;
            // console.log("stopped emission")
            //console.log('rico', lastTempId)
            //this.props.vm.setEditingTarget(lastTempId);
        }
    }

    recieveInformation(message) {
        
        let data = JSON.parse(message.data);
        console.log("data recieved", data)

        if (data.uid == nid) {
            console.log("discarding");
            return;
        }

        // console.log(this.workspace.id)
        
        this.randomIndex = data.rIDX;
        const targetName = data.target;

        let ogTarget = this.props.vm.editingTarget;
        this.lastTempId = ogTarget.id;

        this.changeTarget(targetName);

        for (let message of data.messages) {

            // this is for text entries; for some reason their IDs get changed when saved.
            // so, it sends the index of the parent node (a normal block) and the index of the child node to extract the text entry box
            if (data.parentID != -1) {
                message.blockId = this.workspace.getBlockById(data.parentID).childBlocks_[data.childIDX].id;
            }
            this.parseEvent(message, targetName);
        }

        console.log("finished parsing")

        console.log("ACKTUALLY")
        // this.enableWorkspaceUpdate();
        // this.props.vm.editingTarget = ogTarget
        // this.props.vm.runtime._editingTarget = this.props.vm.editingTarget;
        // console.log("set to", this.props.vm.editingTarget.sprite.name)
        // this.enableWorkspaceUpdate();
    
    }

    changeTarget(targetName) {
        if (targetName == this.props.vm.editingTarget.sprite.name) {return}

        this.disableWorkspaceUpdate()
        const tmpTarget = this.getTargetByName(targetName);

        console.log(tmpTarget, "target")
        this.props.vm.editingTarget = tmpTarget;
        //this.disableWorkspaceUpdate()
        
        // this.props.vm.emitTargetsUpdate(false)
        this.props.vm.emitWorkspaceUpdate();
        // this.props.vm.emitTargetsUpdate(false)
        // this.props.vm.runtime.setEditingTarget(this.props.vm.editingTarget);
        this.props.vm.runtime._editingTarget = this.props.vm.editingTarget;
        //console.log(">>" ,this.pauseWorkspaceUpdate)
        // this.props.vm.setEditingTarget(tmpTarget.id);
    }

    revertToOriginalTarget() {
        this.stopEmission = false;
        const ogTarget = this.props.vm.runtime.getTargetById(this.lastTempId);
        // this.props.vm.editingTarget = ogTarget;
        // this.props.vm.emitTargetsUpdate(false)
        // this.props.vm.emitWorkspaceUpdate();
        // this.props.vm.runtime.setEditingTarget(this.props.vm.editingTarget);
        //wait 0.5 seconds
        // this.queueWhileOnDifferentTarget = true;
        setTimeout(async () => {
            if (ogTarget.id === this.props.vm.editingTarget.id) {return}
            // this.queueWhileOnDifferentTarget = false;
            // this.queueFurtherSends = true;
            // await this.sendBacklog();
            // this.queueFurtherSends = false;
            this.enableWorkspaceUpdate()
            this.props.vm.setEditingTarget(ogTarget.id);
            console.log("OG TARGET SET")
        }, 1);
    }

    parseEvent(event, targetName="") {
        // console.log(this.ScratchBlocks.Events.Abstract.workspaceId)
        // console.log(this.workspace.id)
        console.log('parsing!!', event)

        if (targetName == "") {
            targetName = this.props.vm.editingTarget.sprite.name;
        }
        if (event.type == "comment_change") {
            event.newValue = event.newContents
        }

        // const ogTarget = this.props.vm.editingTarget;
        // const tmpTarget = this.getTargetByName(targetName);

        // this.props.vm.editingTarget = tmpTarget;
        // this.props.vm.runtime._editingTarget = this.props.vm.editingTarget;
        // this.props.vm.setEditingTarget(tmpTarget.id);
        // this.disableWorkspaceUpdate();

        if (this.workspace.getBlockById(event.blockId) == null && (event.type != "create")) {
            console.log(event, "discarded because block does not exist")
            console.log(this.workspace)
            // refresh page
            // await channel.publish('preRefresh', "");
            // await new Promise(r => setTimeout(r, 200));
            // await this.load();
            this.revertToOriginalTarget();
            return;
        }

        if (event.type == "create") {
            this.holdingBlock = true;
        } else if (event.type == "move") {
            this.holdingBlock = false;
            this.workspace.getBlockById(event.blockId).getSvgRoot().style.transition = "transform 0.5s";
        }

        //console.log(event, "recieved")
        
        
        const eventInstance = this.ScratchBlocks.Events.fromJson(event, this.workspace);

        if (event.type == "comment_create") {
            eventInstance.xy = event.commentXY
        }

        try {

            console.log("is have broadcast info", !!event.broadcastInfo, event.broadcastInfo)

            // check if event is a create block (procedure) event
            this.stopEmission = true;
            let isProcedureDefinition = (eventInstance.type == "delete" && 
                this.workspace.getBlockById(event.blockId).type == "procedures_definition");
            if (eventInstance.type == "create" && event.xml.indexOf("mutation proccode") != -1) {
                isProcedureDefinition = true;
            }

            // if event is a broadcast event, we have to manually run the block once more for some reason
            if (!!event.broadcastInfo) {
                console.log("WHAHAHAH")
                const broadcastEvent = {isCloud: false, isLocal: false, type: "var_create", varId: event.broadcastInfo.broadcastId, varName: event.broadcastInfo.broadcastName, varType: "broadcast_msg"}
                this.props.vm.blockListener(broadcastEvent)
                const newEvent = this.ScratchBlocks.Events.fromJson(broadcastEvent, this.workspace);
                newEvent.run(true);
            }
            
            if (eventInstance.type == "ui") { 
                this.props.vm.editingTarget.blocks.blocklyListen(eventInstance); //runs the block
            } else {
                eventInstance.run(true); // handles block
                this.lastBlockId = event.blockId;
                this.lastBlockType = event.type;
            }

            // for create function events, we have to refresh workspace to show new functions
            if (isProcedureDefinition) {
                this.workspace.getToolbox().refreshSelection();
            }
        } catch (e) {
            console.error(e);
        }
        console.log("done")

        if (eventInstance.type == "ui") {
            this.revertToOriginalTarget()
        }

        // this.props.vm.editingTarget = ogTarget;
        // this.props.vm.runtime._editingTarget = this.props.vm.editingTarget;
        // this.enableWorkspaceUpdate();
        
    }

    disableWorkspaceUpdate() {
        console.log("DISABLED!!")
        this.pauseWorkspaceUpdate = true;
    }

    enableWorkspaceUpdate() {
        console.log("ENABLED!!")
        this.pauseWorkspaceUpdate = false;
        if (this.queueWorkspaceUpdate) {
            this.queueWorkspaceUpdate = false;
            this.props.vm.emitWorkspaceUpdate();
        }
    }

    async sendBacklog(parentID=-1, childIDX=-1) {
        while (this.backlog.length > 0) {
            const tmp = this.backlog;
            this.backlog = [];
            await this.sendArray(tmp, parentID, childIDX);
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
        this.workspace.addChangeListener(this.props.vm.blockListener);
        this.workspace.addChangeListener((eve) => {
            //console.log('forced',eve)
            this.sendInformation.bind(this)(eve)
        })
        this.workspace.addChangeListener(this.enableEmission.bind(this))
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
            while(true) {
                let isDuplicate = false;
                for (let target of this.props.vm.runtime.targets) {
                    if (target.sprite.name == inputJSONED.objName) {
                        inputJSONED.objName = incrementStringNumber(inputJSONED.objName)
                        isDuplicate = true;
                        console.log("DUPLICAATE")
                        break;
                    }
                }
                if (!isDuplicate) {
                    break;
                }
            }
            input = JSON.stringify(inputJSONED);
            const msg = {input: input, uid: nid};
            channel.publish('newSprite', JSON.stringify(msg));
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
            // find instance
            const name = this.props.vm.runtime.getTargetById(targetID).sprite.name;
            channel.publish('deleteSprite', JSON.stringify(name));
        }
        channel.subscribe('deleteSprite', (message) => {
            const name = JSON.parse(message.data)
            const id = this.getTargetByName(name).id
            ogDeleteSprite(id)
            // if (ogName != name) {
            //     this.props.vm.setEditingTarget(this.props.vm.runtime.getSpriteTargetByName(ogName).id);
            // }
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
        this.props.vm.postSpriteInfo = async (data) => {
            let name = this.props.vm.editingTarget.sprite.name;
            if (this.props.vm._dragTarget) {
                name = this.props.vm._dragTarget.sprite.name;
            }
            const msg = {name: name, data: data};
            await channel.publish('spriteInfo', JSON.stringify(msg));
        }
        channel.subscribe('spriteInfo', (message) => {
            const d = JSON.parse(message.data);
            this.getTargetByName(d.name).postSpriteInfo(d.data);
            this.props.vm.runtime.emitProjectChanged();
        });

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

        //let ogDeleteSound = this.props.vm.deleteSound.bind(this.props.vm);
        this.props.vm.deleteSound = async (soundIndex) => {
            const name = this.props.vm.runtime.editingTarget.sprite.name;
            const msg = {soundIndex: soundIndex, name: name};
            const ret = await channel.publish('deleteSound', JSON.stringify(msg));
            return ret;
        }
        channel.subscribe('deleteSound', (message) => {
            const d = JSON.parse(message.data);
            const soundIndex = d.soundIndex;
            const target = this.getTargetByName(d.name);
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
        });

        let ogAddSound = this.props.vm.addSound.bind(this.props.vm);
        this.props.vm.addSound = async (sound, idx="AMONGUSLMAO") => {
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

        this.props.vm.deleteCostume = async (costumeIndex) => {
            const spriteName = this.props.vm.editingTarget.sprite.name
            const msg = {costumeIndex: costumeIndex, spriteName: spriteName};
            const ret = await channel.publish('deleteCostume', JSON.stringify(msg));
            return ret;
        }
        channel.subscribe('deleteCostume', (message) => {
            const data = JSON.parse(message.data);
            const costumeIndex = data.costumeIndex;
            // getTargetForStage
            const target = this.getTargetByName(data.spriteName)
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
        });

        let ogAddCostumeFromLibrary = this.props.vm.addCostumeFromLibrary.bind(this.props.vm);
        this.props.vm.addCostumeFromLibrary = async (md5, costumeOBject) => {
            const msg = {md5: md5, costumeOBject: costumeOBject};
            return channel.publish('addCostumeFromLibrary', JSON.stringify(msg));
        }
        channel.subscribe('addCostumeFromLibrary', (message) => {
            const d = JSON.parse(message.data);
            ogAddCostumeFromLibrary(d.md5, d.costumeOBject);
        })

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

        let ogAddCostume = this.props.vm.addCostume.bind(this.props.vm);
        this.props.vm.addCostume = function(md5, costumeOBject, optTarget, optVersion) {
            const msg = {md5: md5, costumeOBject: costumeOBject, optTarget: optTarget, optVersion: optVersion};
            return channel.publish('addCostume', JSON.stringify(msg));
        }
        channel.subscribe('addCostume', (message) => {
            const d = JSON.parse(message.data);
            ogAddCostume(d.md5, d.costumeOBject, d.optTarget, d.optVersion);
        })

        // this.props.vm.createVariable = function(id,name,type,isCloud) {
        //     console.log("VARIABLE MADE")
        //     // const msg = {id: id, name: name, type: type, isCloud: isCloud};
        //     // return channel.publish('createVariable', JSON.stringify(msg));
        // }

        const ogCreateVar = this.workspace.createVariable.bind(this.workspace);
        this.workspace.createVariable = function(name, opt_type, opt_id, opt_isLocal, opt_isCloud) {
            //console.log("VARIABLE MADE", name)
            ogCreateVar(name, opt_type, opt_id, opt_isLocal, opt_isCloud);
            const msg = {name: name, opt_type: opt_type, opt_id: opt_id, opt_isLocal: opt_isLocal, opt_isCloud: opt_isCloud, uid:nid};
            channel.publish('createVariable', JSON.stringify(msg));
        }
        channel.subscribe('createVariable', (message) => {
            const d = JSON.parse(message.data);
            if (d.uid == nid) {return}
            ogCreateVar(d.name, d.opt_type, d.opt_id, d.opt_isLocal, d.opt_isCloud);
        })

        // this.workspace.prototype.createVariable = function(id,name,sf,type,isCloud) {
        //     console.log("MADE VARIABLE")
        // }

        this.props.vm.updateSvg = function (costumeIndex, svg, rotationCenterX, rotationCenterY, targetName = "") {
            //console.log(this)
            var target;
            if (targetName == "")
                target = this.editingTarget
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
            this.emitTargetsUpdate();
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


        this.initInformation.bind(this)();
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
        await this.save();
        console.log("JOINED!!")
        await channel.publish('goodForLoad', "");
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
        
        // When we change sprites, update the toolbox to have the new sprite's blocks
        const toolboxXML = this.getToolboxXML();
        if (toolboxXML) {
            this.props.updateToolboxState(toolboxXML);
        }
        
        if (this.props.vm.editingTarget && !this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {
            this.onWorkspaceMetricsChange();
        }
        
        console.log("moved to ", this.props.vm.editingTarget.sprite.name, "is transistonary:",this.pauseWorkspaceUpdate);
        if (this.pauseWorkspaceUpdate) {
            // this.queueWorkspaceUpdate = true;
            // return;
        } else {
            sessionStorage.setItem('editingTarget', this.props.vm.editingTarget.sprite.name);
        }
        
        // Remove and reattach the workspace listener (but allow flyout events)
        this.workspace.removeChangeListener(this.props.vm.blockListener);
        const dom = this.ScratchBlocks.Xml.textToDom(data.xml);
        console.log(dom)
        try {
            this.ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, this.workspace);
        } catch (error) {
            // The workspace is likely incomplete. What did update should be
            // functional.
            //
            // Instead of throwing the error, by logging it and continuing as
            // normal lets the other workspace update processes complete in the
            // gui and vm, which lets the vm run even if the workspace is
            // incomplete. Throwing the error would keep things like setting the
            // correct editing target from happening which can interfere with
            // some blocks and processes in the vm.
            if (error.message) {
                error.message = `Workspace Update Error: ${error.message}`;
            }
            log.error(error);
        }
        this.workspace.addChangeListener(this.props.vm.blockListener);

        if (this.props.vm.editingTarget && this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {
            const {scrollX, scrollY, scale} = this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id];
            this.workspace.scrollX = scrollX;
            this.workspace.scrollY = scrollY;
            this.workspace.scale = scale;
            this.workspace.resize();
        }

        // Clear the undo state of the workspace since this is a
        // fresh workspace and we don't want any changes made to another sprites
        // workspace to be 'undone' here.
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
        console.log(callback)
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
                {extensionLibraryVisible ? (
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
