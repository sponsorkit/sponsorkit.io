import { Typography } from "@mui/material";

export default function BountyRelocationTooltip() {
    return <>
        <Typography>
            If people know that their bounty can't be refunded, they are more likely to actually award the bounty to the bountyhunters after the issue has been closed. This decreases the chance of bountyhunters finishing their work, only to realize that the bounty isn't going to be awarded to them.
        </Typography>
        <Typography>
            In the event that no one claims the bounty, the bounty is relocated to another issue in the open source community, among the most upvoted issues across all of GitHub.
        </Typography>
        <Typography>
            Bountyhunt's only earnings are the fees.
        </Typography>
    </>
;
}