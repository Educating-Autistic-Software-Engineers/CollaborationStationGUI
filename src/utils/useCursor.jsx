import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { ablySpace, ablyInstance, cursorColor } from "../utils/AblyHandlers.jsx";
import CursorSvg from "./CursorSvg.jsx";
import styles from "./Cursors.module.css";

let thisName

const FALLBACK_WIDTH = 90;
const FALLBACK_HEIGHT = 60;

const channel = ablyInstance.channels.get(ablySpace);
sessionStorage.setItem('blocksRect', JSON.stringify({x: 0, y: 0, right: 0, bottom: 0}))

const clampPosition = (position, maxPosition, elementSize) => {
    return Math.max(0, Math.min(position, maxPosition - elementSize));
};

const YourCursor = ({ self, name, websocket }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const latestPosition = useRef(position);
    const cursorRef = useRef(null);
    const [size, setSize] = useState({ width: 90, height: 60 });
    let cachedPosition = { x: 0, y: 0 };
    let emitIndex = 0;

    thisName = name

    useLayoutEffect(() => {
        if (cursorRef.current) {
            const rect = cursorRef.current.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        }
    }, [name]); // re-measure if the nametag text (name) changes width

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
            let isHovering = latestPosition.current.x < blockRect.right
            if (Number(tabIndex) > 0.5) {
                isHovering = false
            }

            const dragPos = isHovering ? JSON.parse(sessionStorage.getItem("dragRelative")) : {x: 0, y: 0};
            const globalPosition = {x: latestPosition.current.x - dragPos.x, y: latestPosition.current.y - dragPos.y};

            if (JSON.stringify(cachedPosition) === JSON.stringify(globalPosition)) return;
            cachedPosition = globalPosition;

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

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            clearInterval(intervalId);
        };
    }, [self]);

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const clampedX = clampPosition(position.x, viewportWidth, size.width);
    const clampedY = clampPosition(position.y, viewportHeight, size.height);

    return (
        <div
            ref={cursorRef}
            className={styles.cursor}
            style={{
                top: `${clampedY}px`,
                left: `${clampedX}px`,
                maxWidth: `${viewportWidth}px`
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
    // Persist across renders without re-triggering the effect (mirrors the
    // original `let highestEmitIndices = {}` semantics, but keeps it stable
    // across rerenders instead of resetting every render).
    const highestEmitIndicesRef = useRef({});
    // DOM refs for each member's cursor element, keyed by clientId, so we can
    // measure their real width/height (cursor + nametag) for clamping.
    const elementRefs = useRef({});
    // Measured sizes per clientId; updated after each render via effect.
    const [sizes, setSizes] = useState({});
 
    useEffect(() => {
        if (!websocket) {
            console.warn('WebSocket is not defined');
            return;
        }
 
        const handleCursorMessage = (message) => {
            try {
                const { rect } = JSON.parse(message.data);
                JSON.parse(rect);
            } catch (e) {
                return;
            }
            const { clientId, position, hovering, emitIndex, target, color, tabIndex, ogWindow, rect } = JSON.parse(message.data);
 
            if (emitIndex < highestEmitIndicesRef.current[clientId]) return;
            highestEmitIndicesRef.current[clientId] = emitIndex;
 
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
 
        return () => {
            websocket.onmessage = null;
        };
    }, [websocket]);
 
    useLayoutEffect(() => {
        const nextSizes = {};
        let changed = false;
        Object.keys(cursors).forEach(clientId => {
            const el = elementRefs.current[clientId];
            if (el) {
                const rect = el.getBoundingClientRect();
                const width = rect.width || FALLBACK_WIDTH;
                const height = rect.height || FALLBACK_HEIGHT;
                nextSizes[clientId] = { width, height };
                const prev = sizes[clientId];
                if (!prev || prev.width !== width || prev.height !== height) {
                    changed = true;
                }
            } else {
                nextSizes[clientId] = sizes[clientId] || { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
            }
        });
        if (changed || Object.keys(nextSizes).length !== Object.keys(sizes).length) {
            setSizes(nextSizes);
        }
 
        // Drop refs for members who are no longer present.
        Object.keys(elementRefs.current).forEach(clientId => {
            if (!cursors[clientId]) {
                delete elementRefs.current[clientId];
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cursors]);
 
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
 
    return (
        <>
            {Object.entries(cursors).map(([clientId, member]) => {
                const size = sizes[clientId] || { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
 
                const clampedX = clampPosition(member.relposition.x, viewportWidth, size.width);
                const clampedY = clampPosition(member.relposition.y, viewportHeight, size.height);
 
                return (
                    <div
                        key={clientId}
                        ref={el => { elementRefs.current[clientId] = el; }}
                        className={styles.cursor}
                        style={{
                            top: `${clampedY}px`,
                            left: `${clampedX}px`,
                            maxWidth: `${viewportWidth}px`,
                            maxHeight: `${viewportHeight}px`
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