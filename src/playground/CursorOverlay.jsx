// LiveCursors.jsx
import { useMemo, useRef, useEffect, useState } from "react";
import { useMembers, useSpace } from "@ably/spaces/react";
import { mockNames } from "../utils/mockNames.js";
import { colours } from "../utils/helpers.js";
import { MemberCursors, YourCursor } from "../utils/useCursor.jsx";
import React from "react";
import styles1 from "../utils/LiveCursors.module.css";
import styles from "./index.css";
//import 'es6-object-assign/auto';
import 'core-js/fn/array/includes';
//import 'core-js/fn/promise/finally';
import 'intl';
import ConditionalApp from '../components/ConditionalApp.jsx'
import { ablySpace } from "../utils/AblyHandlers.jsx";
const mockName = () => mockNames[Math.floor(Math.random() * mockNames.length)];

const CursorOverlay = () => {
    const name = useMemo(mockName, []);
    const userColors = useMemo(() => colours[Math.floor(Math.random() * colours.length)], []);
    const { space } = useSpace();

    useEffect(() => {
        space?.enter({ name, userColors });
    }, [space]);

    const { self } = useMembers();
    const liveCursors = useRef(null);

    /*
    const cursorUpdate = async (spaces) => {
        const space2 = await spaces.get("test");
        await space2.enter({ name: "Ryon" })

        space2.subscribe('update', (spaceState) => {
            console.log("hi");
        });

        space2.cursors.subscribe("update", async (cursor) => {
            console.log("HI");
            const members = await space2.members.getAll();
            const member = members.find((member) => member.connectionId === cursorUpdate.connectionId);
            MemberCursors(member, cursor);
            YourCursor();
        })
    } 
    cursorUpdate(spaces);
    */
   
    const queryString = window.location.search
    const urlParams = new URLSearchParams(queryString)
    let uname = urlParams.get('name')

    const [websocket, setWebSocket] = useState(null);

    useEffect(() => {
        console.log(`wss://nwab9zf1ik.execute-api.us-east-2.amazonaws.com/production/?room=${ablySpace}`)
        const ws = new WebSocket(`wss://nwab9zf1ik.execute-api.us-east-2.amazonaws.com/production/?room=${ablySpace}`);
        ws.onopen = () => {
            console.log('WebSocket Client Connected', ws);
            setWebSocket(ws);
        };
        ws.onclose = () => {
            console.log('WebSocket Client Disconnected');
            setWebSocket(null);
        };

        const keepAlive = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000); // send a ping message every 30 seconds

        return () => {
            clearInterval(keepAlive);
            if (ws) {
                ws.close();
            }
        };

    }, []);

    if (!websocket) {
        return <div>Loading...</div>
    }

    return (
        <div id="live-cursors" ref={liveCursors} className={styles.app}>
            <ConditionalApp/>
            <YourCursor self={self} name={uname} websocket={websocket}/>
            <MemberCursors websocket={websocket}/>
        </div>
    );
    /*
    <YourCursor self={self} parentRef={liveCursors} className={styles.overlay} />
            <MemberCursors />
            */
};

export default CursorOverlay;