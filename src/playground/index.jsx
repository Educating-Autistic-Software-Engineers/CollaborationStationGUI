
import React from 'react';
import { useRef } from "react";
import ReactDOM from 'react-dom';
import { MemberCursors, YourCursor } from "../utils/useCursor.jsx";
import './index.css';
import supportedBrowser from '../lib/supported-browser.js';
//import * as serviceWorker from './serviceWorker';

import { SpaceProvider, SpacesProvider } from "@ably/spaces/react";
import { nanoid } from "nanoid";
import Spaces from "@ably/spaces";
import { Realtime } from "ably";

import { getSpaceNameFromUrl } from "../utils/helpers";
import CursorOverlay from "./CursorOverlay.jsx";

import { AblyProvider } from 'ably/react';
/*



import Spaces from "@ably/spaces";
import { SpacesProvider, SpaceProvider } from "@ably/spaces/react";
*/

import styles from './index.css';
import {secrets} from "../utils/Secrets.jsx";

import { RotationStyles } from '../components/direction-picker/direction-picker.jsx';
import ConditionalApp from '../components/ConditionalApp.jsx';

const id = nanoid();
const spaceName = getSpaceNameFromUrl()
const client = new Realtime.Promise({ authUrl: "https://p497lzzlxf.execute-api.us-east-2.amazonaws.com/Phase1/ably"});
const spaces = new Spaces(client);
const client2 = new Realtime({ authUrl: "https://p497lzzlxf.execute-api.us-east-2.amazonaws.com/Phase1/ably"});

/*
const space = await spaces.get("test");
await space.enter({ name: "Ryon" })

space.subscribe('update', (spaceState) => {
    console.log("hi");
});

space.cursors.subscribe("update", async (cursor) => {
    console.log("HI");
    const members = await space.members.getAll();
    const member = members.find((member) => member.connectionId === cursorUpdate.connectionId);
    MemberCursors(member, cursor);
    YourCursor();
})

window.addEventListener('mousemove', ({ clientX, clientY }) => {
    space.cursors.set({ position: { x: clientX, y: clientY }, data: { color: 'red' } });
});
*/


const appTarget = document.createElement('div');
appTarget.className = styles.topheader;
document.body.appendChild(appTarget);

/*

    <SpacesProvider client={spaces}>
        <SpaceProvider name="my-space">
*/

ReactDOM.render(
            <AblyProvider client={client2}>
                <CursorOverlay spaces={spaces}/>
            </AblyProvider>,
    appTarget
);


/*
if (supportedBrowser()) {
    // require needed here to avoid importing unsupported browser-crashing code
    // at the top level
    ReactDOM.render(
        require('./render-gui.jsx').default(appTarget),
        appTarget
    );

} else {
    BrowserModalComponent.setAppElement(appTarget);
    const WrappedBrowserModalComponent = AppStateHOC(BrowserModalComponent, true);
    const handleBack = () => {};
    // eslint-disable-next-line react/jsx-no-bind
    ReactDOM.render(<WrappedBrowserModalComponent onBack={handleBack} />, appTarget);
}
*/