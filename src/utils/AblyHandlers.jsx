import React from 'react';

import {Realtime} from "ably";
import {secrets} from "./Secrets.jsx";

export const ablyInstance = new Realtime.Promise(secrets.ablyKey);

