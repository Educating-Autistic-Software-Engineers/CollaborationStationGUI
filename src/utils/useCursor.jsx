import React, { useEffect, useState, useRef } from "react";
import { ablySpace, ablyInstance, cursorColor } from "../utils/AblyHandlers.jsx";
import CursorSvg from "./CursorSvg.jsx";
import styles from "./Cursors.module.css";
import { is } from "core-js/core/object";

let thisName

const cursorWidth =  90; // width of your cursor SVG
const cursorHeight = 60; // height of your cursor SVG

const channel = ablyInstance.channels.get(ablySpace);
sessionStorage.setItem('blocksRect', JSON.stringify({x: 0, y: 0, right: 0, bottom: 0}))

const clampPosition = (position, maxPosition, elementSize) => {
    return Math.max(0, Math.min(position, maxPosition - elementSize));
};

const YourCursor = ({ self, name, websocket }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const latestPosition = useRef(position);
    let cachedPosition = { x: 0, y: 0 };
    let emitIndex = 0;

    thisName = name

    useEffect(() => {
        const handleMouseMove = (event) => {
            const newPosition = {
                x: event.clientX,
                y: event.clientY
            };
            setPosition(newPosition);
            latestPosition.current = newPosition;
        };

        window.addEventListener('mousemove', handleMouseMove);

        const intervalId = setInterval(() => {

            if (!websocket) {return}

            const tabIndex = sessionStorage.getItem("activeTabIndex")
            const blockRect = JSON.parse(sessionStorage.getItem('blocksRect'))
            let isHovering = latestPosition.current.x < blockRect.right// && latestPosition.y > blockRect.y
            if (Number(tabIndex) > 0.5) {
                isHovering = false
            }

            //console.log(tabIndex)

            //console.log(blockRect, latestPosition.current.x, blockRect.right, isHovering)

            const dragPos = isHovering ? JSON.parse(sessionStorage.getItem("dragRelative")) : {x: 0, y: 0};
            const globalPosition = {x: latestPosition.current.x - dragPos.x, y: latestPosition.current.y - dragPos.y};

            if (JSON.stringify(cachedPosition) === JSON.stringify(globalPosition)) return;
            cachedPosition = globalPosition;

            //console.log(document.getElementById('totalsize').getBoundingClientRect());

            // console.log("SENDING!!!", globalPosition)
            // console.log(ablySpace, name)
            websocket.send(JSON.stringify({
                action: "cursorMessage",
                target: sessionStorage.getItem("editingTarget"), 
                room: ablySpace,
                emitIndex: emitIndex++,
                tabIndex: tabIndex,
                clientId: name, 
                position: globalPosition, 
                hovering: isHovering,
                color: cursorColor,
                ogWindow: {innerWidth: window.innerWidth, innerHeight: window.innerHeight},
                rect: sessionStorage.getItem("blocksRect")
            }));
        }, 65);

        // Cleanup the event listener and interval on component unmount
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            clearInterval(intervalId);
        };
    }, [self]);


    // Get the viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Clamp the positions
    const clampedX = clampPosition(position.x, viewportWidth, cursorWidth);
    const clampedY = clampPosition(position.y, viewportHeight, cursorHeight);

    return (
        <div
            className={styles.cursor}
            style={{
                top: `${clampedY}px`,
                left: `${clampedX}px`,
            }}
        >
            <CursorSvg cursorColor={cursorColor} />
            <div style={{ backgroundColor: cursorColor }} className={styles.cursorName}>
                You
            </div>
        </div>
    );
};

const MemberCursors = ({ websocket }) => {
    const [cursors, setCursors] = useState({});
    let highestEmitIndices = {};

    useEffect(() => {
        if (!websocket) {
            console.warn('WebSocket is not defined');
            return;
        }

        const handleCursorMessage = (message) => {
            // console.log(message)
            try {
                const { rect } = JSON.parse(message.data);
                JSON.parse(rect);
            } catch (e) {
                // console.log(e, message.data)
                return;
            }
            const { clientId, position, hovering, emitIndex, target, color, tabIndex, ogWindow, rect } = JSON.parse(message.data);
            
            if (emitIndex < highestEmitIndices[clientId]) return;
            highestEmitIndices[clientId] = emitIndex;

            // console.log(thisName, clientId)
            if (clientId === thisName) return;

            const ogRect = JSON.parse(rect);
            const blockRect = JSON.parse(sessionStorage.getItem('blocksRect'));

            let isInvisible = false;
            const dragOffset = JSON.parse(sessionStorage.getItem("dragRelative"));
            const dragPos = hovering && !(position.x + dragOffset.x < 312) ? dragOffset : { x: 0, y: 0 };
            let relposition = { x: position.x + dragPos.x, y: position.y + dragPos.y };

            if (hovering) {
                if (relposition.x < blockRect.x || relposition.y < blockRect.y || relposition.x > blockRect.right || relposition.y > blockRect.bottom) {
                    isInvisible = true;
                }
            } else {
                const xScale = (window.innerWidth - blockRect.right) / (ogWindow.innerWidth - ogRect.right);
                relposition.x = (relposition.x - ogRect.right) * xScale + blockRect.right;
            }

            if (target !== sessionStorage.getItem("editingTarget") || sessionStorage.getItem("activeTabIndex") !== tabIndex) {
                isInvisible = true;
            }

            const actualColor = isInvisible ? "#ffffff00" : color;
            setCursors(prevCursors => ({
                ...prevCursors,
                [clientId]: { relposition, cursorColor: actualColor, name: clientId }
            }));
        };

        websocket.onmessage = handleCursorMessage;

        // Cleanup the subscription on component unmount
        return () => {
            websocket.onmessage = null;
        };
    }, [websocket]);

    const clampPosition = (position, max, cursorSize) => {
        return Math.max(0, Math.min(position, max - cursorSize));
    };

    const cursorWidth = 20; // Define cursor width if needed
    const cursorHeight = 20; // Define cursor height if needed

    return (
        <>
            {Object.values(cursors).map((member, index) => {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                const clampedX = clampPosition(member.relposition.x, viewportWidth, cursorWidth);
                const clampedY = clampPosition(member.relposition.y, viewportHeight, cursorHeight);

                return (
                    <div
                        key={index}
                        className={styles.cursor}
                        style={{
                            top: `${clampedY}px`,
                            left: `${clampedX}px`,
                        }}
                    >
                        <CursorSvg cursorColor={member.cursorColor} />
                        <div style={{ backgroundColor: member.cursorColor }} className={styles.cursorName}>
                            {member.cursorColor === "#ffffff00" ? "" : member.name}
                        </div>
                    </div>
                );
            })}
        </>
    );
};

export { MemberCursors, YourCursor };