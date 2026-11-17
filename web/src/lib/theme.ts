/** localStorage key holding "light" | "dark"; absent = follow the system setting. */
export const THEME_KEY = "sponsorkit.theme";

/** Runs before first paint (inlined in <head>) so the stored theme applies without a flash. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
