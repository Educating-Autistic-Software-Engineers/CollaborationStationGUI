import React from 'react';

import {Realtime} from "ably";
import {secrets} from "./Secrets.jsx";

const queryString = window.location.search
const urlParams = new URLSearchParams(queryString)

export const ablySpace = urlParams.get('space').toString();

export const ablyInstance = new Realtime.Promise({authUrl: "https://p497lzzlxf.execute-api.us-east-2.amazonaws.com/Phase1/ably"});

