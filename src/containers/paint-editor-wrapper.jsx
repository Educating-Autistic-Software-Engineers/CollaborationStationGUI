import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';
import PaintEditor from 'scratch-paint';
import {inlineSvgFonts} from 'scratch-svg-renderer';

import {connect} from 'react-redux';

import { ablyInstance, ablySpace } from '../utils/AblyHandlers';

const channel = ablyInstance.channels.get(ablySpace);

class PaintEditorWrapper extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleUpdateImage',
            'handleUpdateName'
        ]);
    }
    shouldComponentUpdate (nextProps) {
        return this.props.imageId !== nextProps.imageId ||
            this.props.rtl !== nextProps.rtl ||
            this.props.name !== nextProps.name;
    }
    handleUpdateName (name) {
        const msg = {
            name: name,
            costumeIndex: this.props.selectedCostumeIndex
        }
        channel.publish('renameCostume', JSON.stringify(msg));
    }
    async handleUpdateImage (isVector, image, rotationCenterX, rotationCenterY) {
        const target = this.props.vm.editingTarget
        const assetId = target.sprite['costumes'][this.props.selectedCostumeIndex].assetId
        console.log('pre',assetId)
        
        const msg = {
            editingTarget: this.props.vm.editingTarget.sprite.name,
            image: image,
            rotationCenterX: rotationCenterX,
            rotationCenterY: rotationCenterY,
            isVector: isVector,
            selectedIdx: this.props.selectedCostumeIndex,
        }
        
        await channel.publish('imageUpdated', JSON.stringify(msg));
    }
    render () {
        if (!this.props.imageId) return null;
        const {
            selectedCostumeIndex,
            vm,
            ...componentProps
        } = this.props;

        return (
            <PaintEditor
                {...componentProps}
                image={vm.getCostume(selectedCostumeIndex)}
                onUpdateImage={this.handleUpdateImage}
                onUpdateName={this.handleUpdateName}
                fontInlineFn={inlineSvgFonts}
            />
        );
    }
}

PaintEditorWrapper.propTypes = {
    imageFormat: PropTypes.string.isRequired,
    imageId: PropTypes.string.isRequired,
    name: PropTypes.string,
    rotationCenterX: PropTypes.number,
    rotationCenterY: PropTypes.number,
    rtl: PropTypes.bool,
    selectedCostumeIndex: PropTypes.number.isRequired,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = (state, {selectedCostumeIndex}) => {
    const targetId = state.scratchGui.vm.editingTarget.id;
    const sprite = state.scratchGui.vm.editingTarget.sprite;
    // Make sure the costume index doesn't go out of range.
    const index = selectedCostumeIndex < sprite.costumes.length ?
        selectedCostumeIndex : sprite.costumes.length - 1;
    const costume = state.scratchGui.vm.editingTarget.sprite.costumes[index];
    return {
        name: costume && costume.name,
        rotationCenterX: costume && costume.rotationCenterX,
        rotationCenterY: costume && costume.rotationCenterY,
        imageFormat: costume && costume.dataFormat,
        imageId: targetId && `${targetId}${costume.skinId}`,
        rtl: state.locales.isRtl,
        selectedCostumeIndex: index,
        vm: state.scratchGui.vm,
        zoomLevelId: targetId
    };
};

export default connect(
    mapStateToProps
)(PaintEditorWrapper);
