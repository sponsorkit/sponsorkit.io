import { useBroadcast } from "@hooks/broadcast";
import { Button, Card, CardActions, CardContent, Typography } from "@mui/material";
import { AppBarLayout } from "@pages/index";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
import classes from "./landing-page.module.scss";

export default function LandingPage(props: {
    logoVariant: "sponsorkit" | "bountyhunt",
    title: string,
    continueUrl?: string
}) {
    const router = useRouter();
    const broadcastId = useMemo(
        () => router.query.broadcastId as string, 
        [
            router.query, 
            router.query.broadcastId
        ]);

    const beacon = useBroadcast(broadcastId);
    useEffect(() => {
        if(beacon)
            window.close();
    }, [beacon]);

    if(beacon === undefined)
        return null;

    return <AppBarLayout logoVariant={props.logoVariant}>
        <Card>
            <CardContent>
                <Typography>
                    {props.title}
                </Typography>
            </CardContent>
            <CardActions className={classes["card-actions"]}>
                <Button
                    variant={props.continueUrl ?
                        "text" :
                        "contained"}
                    color={props.continueUrl ?
                        "secondary" :
                        "primary"}
                    onClick={() => {
                        window.close();
                    }}
                >
                    Close
                </Button>
                {props.continueUrl && !beacon && <Button
                    variant="contained"
                    color="primary"
                    onClick={() => {
                        if(!props.continueUrl)
                            throw new Error("No continue URL.");

                        window.location.href = props.continueUrl;
                    }}
                >
                    Continue
                </Button>}
            </CardActions>
        </Card>
    </AppBarLayout>
}