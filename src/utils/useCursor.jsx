import React, { useEffect, useState, useRef } from "react";
import { ablySpace, ablyInstance } from "../utils/AblyHandlers.jsx";
import CursorSvg from "./CursorSvg.jsx";
import styles from "./Cursors.module.css";

let thisName

const channel = ablyInstance.channels.get(ablySpace);
const YourCursor = ({ self, name }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const latestPosition = useRef(position);
    let cachedPosition = { x: 0, y: 0 };

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
            if (JSON.stringify(cachedPosition) === JSON.stringify(latestPosition.current)) return;
            cachedPosition = latestPosition.current;
            channel.publish('cursor', JSON.stringify({ clientId: name, position: latestPosition.current }));
        }, 200);

        // Cleanup the event listener and interval on component unmount
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            clearInterval(intervalId);
        };
    }, [self]);

    const cursorColor = "#FF0000";

    return (
        <div
            className={styles.cursor}
            style={{
                top: `${position.y}px`,
                left: `${position.x}px`,
            }}
        >
            <CursorSvg cursorColor={cursorColor} />
            <div style={{ backgroundColor: cursorColor }} className={styles.cursorName}>
                You
            </div>
        </div>
    );
};

const MemberCursors = () => {
    const [cursors, setCursors] = useState({});

    useEffect(() => {
        const handleCursorMessage = (message) => {
            const { clientId, position } = JSON.parse(message.data);
            if (clientId === thisName) return;
            setCursors(prevCursors => ({
                ...prevCursors,
                [clientId]: { position, cursorColor: "#00FF00", name: clientId }
            }));
        };

        channel.subscribe('cursor', handleCursorMessage);

        // Cleanup the subscription on component unmount
        return () => {
            channel.unsubscribe('cursor', handleCursorMessage);
        };
    }, []);

    return (
        <>
            {Object.values(cursors).map((member, index) => (
                <div
                    key={index}
                    className={styles.cursor}
                    style={{
                        top: `${member.position.y}px`,
                        left: `${member.position.x}px`,
                    }}
                >
                    <CursorSvg cursorColor={member.cursorColor} />
                    <div style={{ backgroundColor: member.cursorColor }} className={styles.cursorName}>
                        {member.name}
                    </div>
                </div>
            ))}
        </>
    );
};

export { MemberCursors, YourCursor };