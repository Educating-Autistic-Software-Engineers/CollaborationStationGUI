import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {connect} from 'react-redux';
import {ablyInstance} from "../utils/AblyHandlers.jsx";

import ControlsComponent from '../components/controls/controls.jsx';

class Controls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleGreenFlagClick',
            'handleStopAllClick'
        ]);
        this.subscribe()
    }
    async subscribe() {
        const channel = ablyInstance.channels.get('blocks');
        await channel.subscribe('greenclick', (message) => this.onGreenClick(message));
        await channel.subscribe('redclick', (message) => this.onRedClick(message));
    }
    async handleGreenFlagClick (e) {
        //console.log(e)
        const channel = ablyInstance.channels.get('blocks');
        await channel.publish('greenclick', JSON.stringify(""));
    }
    async handleStopAllClick (e) {
        const channel = ablyInstance.channels.get('blocks');
        await channel.publish('redclick', JSON.stringify(""));
    }
    
    onGreenClick(msg) {

        //const e = JSON.parse(msg.data);

        //e.preventDefault();
        
            //this.props.vm.setTurboMode(!this.props.turbo);
        
            if (!this.props.isStarted) {
                this.props.vm.start();
            }
            this.props.vm.greenFlag();
        
    }
    onRedClick (e) {
        //e.preventDefault();
        this.props.vm.stopAll();
    }
    render () {
        const {
            vm, // eslint-disable-line no-unused-vars
            isStarted, // eslint-disable-line no-unused-vars
            projectRunning,
            turbo,
            ...props
        } = this.props;
        return (
            <ControlsComponent
                {...props}
                active={projectRunning}
                turbo={turbo}
                onGreenFlagClick={this.handleGreenFlagClick}
                onStopAllClick={this.handleStopAllClick}
            />
        );
    }
}

Controls.propTypes = {
    isStarted: PropTypes.bool.isRequired,
    projectRunning: PropTypes.bool.isRequired,
    turbo: PropTypes.bool.isRequired,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.running,
    projectRunning: state.scratchGui.vmStatus.running,
    turbo: state.scratchGui.vmStatus.turbo
});
// no-op function to prevent dispatch prop being passed to component
const mapDispatchToProps = () => ({});

export default connect(mapStateToProps, mapDispatchToProps)(Controls);
