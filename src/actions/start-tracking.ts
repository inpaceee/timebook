import {
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  action,
} from "@elgato/streamdeck";

@action({ UUID: "net.progwise.timebook.tracking" })
export class StartTracking extends SingletonAction {
  onWillAppear(ev: WillAppearEvent<object>): void | Promise<void> {
    return ev.action.setTitle("Initial text");
  }
  onKeyDown(ev: KeyDownEvent<object>): void | Promise<void> {
    return ev.action.setTitle("Tracking...");
  }
}
