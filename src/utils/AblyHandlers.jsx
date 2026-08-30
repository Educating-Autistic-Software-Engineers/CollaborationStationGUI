import React from 'react';

import {Realtime} from "ably";
import {secrets} from "./Secrets.jsx";


const queryString = window.location.search
const urlParams = new URLSearchParams(queryString)

var space

sessionStorage.setItem('analMode', "F")
sessionStorage.setItem('viewMode', "F")
try {
    space = urlParams.get('view').toString()
    sessionStorage.setItem('isViewOnly', "T")
    sessionStorage.setItem('viewMode', "T")
} catch {
    try {
        space = urlParams.get('anal').toString()
        sessionStorage.setItem('isViewOnly', "T")
        sessionStorage.setItem('analMode', "T")
    } catch {
        space = urlParams.get('space').toString()
        sessionStorage.setItem('isViewOnly', "F")
    }
}

export const inSpace = space
export const ablySpace = space && space.endsWith('_inner') ? space : `${space}_inner`;
export const name = urlParams.get('name').toString()
export const cursorColor = urlParams.get('color').toString()

// Optional `versionOffset` query arg (0 = current save, 1 = one save back, ...).
// Re-exported here so all of the room's query args are discoverable in one place;
// the live value and its subscribers live in versionOffset.js.
export {versionOffsetEnabled, initialVersionOffset} from './versionOffset.js'

export const ablyInstance = new Realtime.Promise({
    authUrl: "https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/ablyToken?name=" + name,
});