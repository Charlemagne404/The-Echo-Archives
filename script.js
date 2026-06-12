import { initializeApp } from "./shared/app/app.js";

initializeApp().catch((error) => {
  console.error("Failed to initialize the Echo Archives app.", error);
});
