import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';
import PaintEditor from 'scratch-paint';
import {inlineSvgFonts} from 'scratch-svg-renderer';

import {connect} from 'react-redux';

import { ablyInstance, ablySpace, name } from '../utils/AblyHandlers';

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
        this.props.vm.renameCostume(this.props.selectedCostumeIndex, name);
    }
    imageDataToBase64(imageData) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);
            canvas.toBlob(blob => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }, 'image/png');
        });
    }
    async handleUpdateImage (isVector, image, rotationCenterX, rotationCenterY) {
        const target = this.props.vm.editingTarget
        
        if (isVector) {
            this.props.vm.updateSvg(
                this.props.selectedCostumeIndex,
                image,
                rotationCenterX,
                rotationCenterY,
                target.sprite.name
            );
        } else {
            this.props.vm.updateBitmap(
                this.props.selectedCostumeIndex,
                image,
                rotationCenterX,
                rotationCenterY,
                2 /* bitmapResolution */,
                target.sprite.name
            );
        }

        if (!isVector) {
            const b64image = await this.imageDataToBase64(image)
            image = JSON.stringify(b64image)
        }
        
        const assetId = target.sprite['costumes'][this.props.selectedCostumeIndex].assetId
        const ext = isVector ? 'svg' : 'png'

        console.log('pre',assetId)
        
        const msg = {
            name: name,
            editingTarget: target.sprite.name,
            md5: assetId,
            rotationCenterX: rotationCenterX,
            rotationCenterY: rotationCenterY,
            isVector: isVector,
            selectedIdx: this.props.selectedCostumeIndex,
        }
        
        const targetURL = `https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/images?fileName=${assetId}.${ext}&cd=attachment`
        const res = await fetch(targetURL, {
            method: 'POST',
            headers: {
                'Accept': '*/*',
                'Connection': 'keep-alive',
                'Content-Type': isVector ? 'image/svg+xml' : 'image/png',
                'Content-Disposition': `attachment`,
            },
            body: image
        });
        console.log('image',image, res)
        
        await channel.publish('imageUpdated', JSON.stringify(msg));
        console.log('post',target.sprite['costumes'][this.props.selectedCostumeIndex].assetId,res)
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
