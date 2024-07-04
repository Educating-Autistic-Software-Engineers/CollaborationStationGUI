import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import QuestionComponent from '../components/question/question.jsx';

import {ablyInstance, ablySpace} from '../utils/AblyHandlers.jsx';
const ablyChannel = ablyInstance.channels.get(ablySpace);

class Question extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange',
            'handleKeyPress',
            'handleSubmit'
        ]);
        this.state = {
            answer: ''
        };
        ablyChannel.subscribe('changeAnswer', (message) => {
            this.setState({answer: JSON.parse(message.data)});
        });
        ablyChannel.subscribe('submitAnswer', (message) => {
            this.props.onQuestionAnswered(JSON.parse(message.data));
        });
    }
    handleChange (e) {
        ablyChannel.publish('changeAnswer', JSON.stringify(e.target.value));
    }
    handleKeyPress (event) {
        if (event.key === 'Enter') this.handleSubmit();
    }
    handleSubmit () {
        ablyChannel.publish('submitAnswer', JSON.stringify(this.state.answer));
    }
    render () {
        return (
            <QuestionComponent
                answer={this.state.answer}
                question={this.props.question}
                onChange={this.handleChange}
                onClick={this.handleSubmit}
                onKeyPress={this.handleKeyPress}
            />
        );
    }
}

Question.propTypes = {
    onQuestionAnswered: PropTypes.func.isRequired,
    question: PropTypes.string
};

export default Question;
