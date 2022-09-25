import { newGuid } from "@utils/guid";
import { useEffect, useState } from "react";

type BroadcastMessage = {
    broadcastId: string,
    senderId: string
}

export function useBroadcast(broadcastId: string) {
    const [state, setState] = useState<boolean>();

    useEffect(() => {
        if(!broadcastId)
            return;
            
        const seenSenderIds = new Set<string>();
        const broadcast = new BroadcastChannel(`sponsorkit-${broadcastId}`);

        var disconnect = () => {
            clearTimeout(timeoutId);
            broadcast.removeEventListener("message", listener);
            broadcast.close();
        };

        var listener = (e: MessageEvent<BroadcastMessage>) => {
            console.log("Received broadcast", e.data);

            if(seenSenderIds.has(e.data.senderId))
                return;

            seenSenderIds.add(e.data.senderId);

            clearTimeout(timeoutId);
            broadcast.postMessage(e.data);
            setState(true);
        };

        broadcast.addEventListener("message", listener);

        const messageToSend: BroadcastMessage = {
            broadcastId,
            senderId: newGuid()
        }
        console.trace("Sending broadcast", messageToSend);
        broadcast.postMessage(messageToSend);

        var timeoutId = setTimeout(() => {
            setState(false);
        }, 1000);

        return disconnect;
    }, [broadcastId]);

    return state;
}