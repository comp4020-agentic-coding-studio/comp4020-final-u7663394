import { createRouter, createWebHistory } from "vue-router";
import RoomView from "./views/RoomView.vue";
import ScrollView from "./views/ScrollView.vue";
import { HALL } from "../../shared/api.ts";

// "/" is the hall everyone shares; /r/<room> is a table's own; /scroll/<id>
// is one scroll, kept. /readme/ is served by the server, outside the app.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: RoomView, props: { room: HALL } },
    { path: "/r/:room", component: RoomView, props: true },
    { path: "/scroll/:id", component: ScrollView, props: true },
    { path: "/:rest(.*)", redirect: "/" },
  ],
});
