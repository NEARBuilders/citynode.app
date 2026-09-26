import { API, App, UI } from "everything-dev/descriptor";

export default App({
  name: "@everything-dev/auth-plugin",
  api: API({ path: "api" }),
  ui: UI({ path: "ui" }),
});
