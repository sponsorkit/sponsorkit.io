import { Button, Card, CardActions, CardContent, Typography } from "@mui/material";
import { AppBarLayout } from "@pages/index";
import classes from "./landing-page.module.scss";

export default function LandingPage(props: {
    logoVariant: "sponsorkit" | "bountyhunt",
    title: string,
    continueUrl?: string
}) {
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
                {props.continueUrl && <Button
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