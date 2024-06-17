// LiveCursors.jsx
import { useMemo, useRef, useEffect } from "react";
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
const mockName = () => mockNames[Math.floor(Math.random() * mockNames.length)];

const CursorOverlay = ({ spaces }) => {
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

    return (
        <div id="live-cursors" ref={liveCursors} className={styles.app}>
            <ConditionalApp/>
            <YourCursor self={3} name={uname} className={styles.overlay} />
            <MemberCursors />
        </div>
    );
    /*
    <YourCursor self={self} parentRef={liveCursors} className={styles.overlay} />
            <MemberCursors />
            */
};

export default CursorOverlay;