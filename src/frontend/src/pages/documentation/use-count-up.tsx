import { useAnimatedCount } from "@hooks/count-up"
import { Button, Typography } from "@material-ui/core";
import { Box } from "@material-ui/system";
import { useState } from "react"

export default () => {
    const [value, setValue] = useState(100);
    const count = useAnimatedCount(
        () => value,
        [value]);

    return <Box>
        <Typography>
            Current: {count.current}
        </Typography>
        <Typography>
            Previous: {count.previous}
        </Typography>
        <Typography>
            Animated: {count.animated}
        </Typography>
        <Button onClick={() => setValue(value + 123)}>
            Increase
        </Button>
    </Box>
}