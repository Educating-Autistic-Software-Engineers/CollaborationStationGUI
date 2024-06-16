import React, { useEffect, useState } from "react";
import { ablySpace, ablyInstance } from "../utils/AblyHandlers.jsx";
import CursorSvg from "./CursorSvg.jsx";
import styles from "./Cursors.module.css";

const channel = ablyInstance.channels.get(ablySpace);

const YourCursor = ({ self, parentRef }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (event) => {
            const newPosition = {
                x: event.clientX,
                y: event.clientY
            };
            setPosition(newPosition);
            channel.publish('cursor', JSON.stringify(newPosition));
        };

        window.addEventListener('mousemove', handleMouseMove);

        // Cleanup the event listener on component unmount
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    const cursorColor = "#FF0000";

    return <div></div>
    // return (
    //     <div
    //         className={styles.cursor}
    //         style={{
    //             top: `${position.y}px`,
    //             left: `${position.x}px`,
    //         }}
    //     >
    //         <CursorSvg cursorColor={cursorColor} />
    //         <div style={{ backgroundColor: cursorColor }} className={styles.cursorName}>
    //             You
    //         </div>
    //     </div>
    // );
};

const MemberCursors = () => {
    const [cursors, setCursors] = useState({});

    useEffect(() => {
        const handleCursorMessage = (message) => {
            const { clientId, data } = message;
            const position = JSON.parse(data);
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
