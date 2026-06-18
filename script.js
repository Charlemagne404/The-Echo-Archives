import { initializeApp } from "./shared/app/app.js?v=5";

initializeApp().catch((error) => {
  console.error("Failed to initialize the Echo Archives app.", error);
});
