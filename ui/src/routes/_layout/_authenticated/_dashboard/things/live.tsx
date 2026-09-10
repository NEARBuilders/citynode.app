import { createFileRoute } from "@tanstack/react-router";
import { ThingsLiveStreamPage } from "./-live-stream";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/things/live")({
  head: () => ({
    meta: [
      { title: "Live Stream | Things | app" },
      { name: "description", content: "Real-time Thing creation and deletion events." },
    ],
  }),
  component: ThingsLiveStreamPage,
});
