import {
  Action,
  KeyDownEvent,
  PayloadObject,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
  action,
} from "@elgato/streamdeck";
import {
  differenceInSeconds,
  minutesToHours,
  parseISO,
  secondsToMinutes,
} from "date-fns";

import request, { gql } from "graphql-request";

const StartTrackingMutationDocument = gql`
  mutation trackingStart($taskId: ID!) {
    trackingStart(taskId: $taskId) {
      start
      task {
        id
      }
    }
  }
`;

const StopTrackingMutationDocument = gql`
  mutation trackingStop {
    trackingStop {
      id
      task {
        id
      }
    }
  }
`;

const CurrentTrackingQueryDocument = gql`
  query currentTracking {
    currentTracking {
      start
      task {
        id
      }
    }
  }
`;

const CurrentTaskTitleDocument = gql`
  query Task($taskId: ID!) {
    task(taskId: $taskId) {
      title
      id
    }
  }
`;

@action({ UUID: "net.progwise.timebook.tracking" })
export class StartTracking extends SingletonAction {
  private interval?: NodeJS.Timeout;
  private taskTitle?: string;
  async onWillAppear(
    ev: WillAppearEvent<{ accessToken: string; taskID: string }>
  ): Promise<void> {
    const { accessToken, taskID } = ev.payload.settings;
    const response = await request<{
      task: { title: string; id: string } | null;
    }>({
      url: "http://localhost:3000/api/graphql",
      document: CurrentTaskTitleDocument,
      requestHeaders: { authorization: `ApiKey ${accessToken}` },
      variables: { taskId: taskID },
    });

    this.taskTitle = response.task?.title;

    await this.updateCurrentTrackingTitle(ev.payload.settings, ev.action);

    this.interval = setInterval(async () => {
      await this.updateCurrentTrackingTitle(ev.payload.settings, ev.action);
    }, 1000);
  }
  private async updateCurrentTrackingTitle(
    payload: PayloadObject<{
      accessToken: string;
      taskID: string;
    }>,
    action: Action
  ) {
    const { accessToken } = payload;
    const response = await request<{
      currentTracking?: { start: string; task: { id: string } };
    }>({
      url: "http://localhost:3000/api/graphql",
      document: CurrentTrackingQueryDocument,
      requestHeaders: { authorization: `ApiKey ${accessToken}` },
    });

    const getDurationString = (difference: number) => {
      const differenceInMinutes = secondsToMinutes(difference);
      const hours = minutesToHours(differenceInMinutes);
      const seconds = difference % 60;
      const minutes = differenceInMinutes % 60;

      const secondsWithLeadingZero = seconds.toString().padStart(2, "0");
      const minutesWithLeadingZero = minutes.toString().padStart(2, "0");
      return `${
        hours > 0 ? `${hours}:` : ""
      }${minutesWithLeadingZero}:${secondsWithLeadingZero}`;
    };

    const startDate = response.currentTracking
      ? parseISO(response.currentTracking.start)
      : undefined;

    if (startDate && payload.taskID === response.currentTracking?.task.id) {
      const newDifference = differenceInSeconds(new Date(), startDate);
      action.setTitle(`${this.taskTitle}\n${getDurationString(newDifference)}`);
    } else {
      action.setTitle("Not\ntracking");
    }
  }
  onWillDisappear(ev: WillDisappearEvent<object>): void | Promise<void> {
    clearInterval(this.interval);
    ev.action.setTitle("");
  }

  private async stopCurrentTracking(
    payload: PayloadObject<{ accessToken: string }>,
    action: Action
  ) {
    const { accessToken } = payload;
    await request({
      url: "http://localhost:3000/api/graphql",
      document: StopTrackingMutationDocument,
      requestHeaders: { authorization: `ApiKey ${accessToken}` },
    });
    action.setTitle("Not\n tracking");
  }

  async onKeyDown(
    ev: KeyDownEvent<{ accessToken: string; taskID: string }>
  ): Promise<void> {
    const { accessToken, taskID } = ev.payload.settings;

    try {
      const response = await request<{
        currentTracking?: { start: string; task: { id: string } };
      }>({
        url: "http://localhost:3000/api/graphql",
        document: CurrentTrackingQueryDocument,
        requestHeaders: { authorization: `ApiKey ${accessToken}` },
      });

      if (
        response.currentTracking &&
        taskID === response.currentTracking?.task.id
      ) {
        await this.stopCurrentTracking(ev.payload.settings, ev.action);
      } else {
        await request({
          url: "http://localhost:3000/api/graphql",
          document: StartTrackingMutationDocument,
          variables: { taskId: taskID },
          requestHeaders: { authorization: `ApiKey ${accessToken}` },
        });
      }
    } catch (error) {
      console.log(error);
    }

    await this.updateCurrentTrackingTitle(ev.payload.settings, ev.action);
  }
}
