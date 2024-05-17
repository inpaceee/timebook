import {
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  action,
} from "@elgato/streamdeck";

@action({ UUID: "net.progwise.timebook.tracking-stop" })
export class StopTracking extends SingletonAction {
  onWillAppear(ev: WillAppearEvent<object>): void | Promise<void> {
    return ev.action.setTitle("Tracking...");
  }
  onKeyDown(ev: KeyDownEvent<object>): void | Promise<void> {
    return ev.action.setTitle("Concluding text");
  }
}
