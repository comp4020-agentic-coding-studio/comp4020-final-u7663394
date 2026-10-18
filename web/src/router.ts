import { createRouter, createWebHistory } from "vue-router";
import RoomView from "./views/RoomView.vue";
import ScrollView from "./views/ScrollView.vue";
import ClothView from "./views/ClothView.vue";
import VideoView from "./views/VideoView.vue";
import { HALL } from "../../shared/api.ts";

// "/" is the hall everyone shares; /r/<room> is a table's own; /scroll/<id>
// is one scroll, kept. /cloth and /r/<room>/cloth are a room's water cloth
// (doc/adr/0006-the-water-cloth.md). /video is the introduction video.
// /readme/ is served by the server.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: RoomView, props: { room: HALL } },
    { path: "/r/:room", component: RoomView, props: true },
    { path: "/cloth", component: ClothView, props: { room: HALL } },
    { path: "/r/:room/cloth", component: ClothView, props: true },
    { path: "/scroll/:id", component: ScrollView, props: true },
    { path: "/video", component: VideoView },
    { path: "/:rest(.*)", redirect: "/" },
  ],
});
