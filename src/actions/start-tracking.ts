import streamDeck, {
  Action,
  KeyDownEvent,
  PropertyInspectorDidAppearEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
  action,
} from "@elgato/streamdeck";
import {
  differenceInSeconds,
  formatISO,
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

const MyProjectsQueryDocument = gql`
  query myProjects($from: Date!) {
    projects(from: $from) {
      title
      tasks {
        id
        title
      }
    }
  }
`;

type TrackingSettings = {
  taskID: string;
  taskTitle?: string;
};

type GlobalSettings = {
  accessToken: string;
};

type Project = {
  title: string;
  tasks: {
    id: string;
    title: string;
  }[];
};

@action({ UUID: "net.progwise.timebook.tracking" })
export class StartTracking extends SingletonAction<TrackingSettings> {
  private interval?: NodeJS.Timeout;
  private activeButtons = new Map<string, Action<TrackingSettings>>();
  private projects: Project[] = [];

  async onWillAppear(ev: WillAppearEvent<TrackingSettings>): Promise<void> {
    const { taskID } = await ev.action.getSettings();

    // ev.action.sendToPropertyInspector({ taskID });
    const { accessToken } =
      await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    await request<{
      task: { title: string; id: string } | null;
    }>({
      url: "http://localhost:3000/api/graphql",
      document: CurrentTaskTitleDocument,
      requestHeaders: { authorization: `ApiKey ${accessToken}` },
      variables: { taskId: taskID },
    });

    if (this.activeButtons.size === 0) {
      this.interval = setInterval(async () => {
        await this.updateCurrentTrackingTitle();
      }, 1000);
      await this.fetchProjects(ev.action);
    }
    this.activeButtons.set(ev.action.id, ev.action);
  }
  private async updateCurrentTrackingTitle() {
    const { accessToken } =
      await streamDeck.settings.getGlobalSettings<GlobalSettings>();
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

    for (const action of this.activeButtons.values()) {
      const { taskID } = await action.getSettings();
      const taskTitle = this.projects
        .flatMap((project) => project.tasks)
        .find((task) => taskID === task.id)?.title;
      if (startDate && taskID === response.currentTracking?.task.id) {
        const newDifference = differenceInSeconds(new Date(), startDate);
        action.setTitle(`${taskTitle}\n${getDurationString(newDifference)}`);
      } else {
        action.setTitle(taskTitle);
      }
    }
  }
  onWillDisappear(ev: WillDisappearEvent<object>): void | Promise<void> {
    this.activeButtons.delete(ev.action.id);

    if (this.activeButtons.size === 0) {
      clearInterval(this.interval);
    }
  }

  private async stopCurrentTracking(action: Action<TrackingSettings>) {
    const { accessToken } =
      await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    await request({
      url: "http://localhost:3000/api/graphql",
      document: StopTrackingMutationDocument,
      requestHeaders: { authorization: `ApiKey ${accessToken}` },
    });
    action.setTitle("Not\ntracking");
  }

  async onKeyDown(ev: KeyDownEvent<TrackingSettings>): Promise<void> {
    const { taskID } = await ev.action.getSettings();
    const { accessToken } =
      await streamDeck.settings.getGlobalSettings<GlobalSettings>();

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
        await this.stopCurrentTracking(ev.action);
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

    await this.updateCurrentTrackingTitle();
  }

  async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<TrackingSettings>
  ): Promise<void> {
    await ev.action.sendToPropertyInspector<DataSourcePayload>({
      event: "sendProjects",
      items: this.projects.map((project) => ({
        label: project.title,
        children: project.tasks.map((task) => ({
          label: task.title,
          value: task.id,
        })),
      })),
    });
  }

  private async fetchProjects(action: Action<TrackingSettings>) {
    const { taskID } = await action.getSettings();
    const { accessToken } =
      await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    await request<{
      task: { title: string; id: string } | null;
    }>({
      url: "http://localhost:3000/api/graphql",
      document: CurrentTaskTitleDocument,
      requestHeaders: { authorization: `ApiKey ${accessToken}` },
      variables: { taskId: taskID },
    });

    const projectsResponse = await request<{
      projects: Project[];
    }>({
      url: "http://localhost:3000/api/graphql",
      document: MyProjectsQueryDocument,
      requestHeaders: { authorization: `ApiKey ${accessToken}` },
      variables: { from: formatISO(new Date(), { representation: "date" }) },
    });

    this.projects = projectsResponse.projects;
  }
}
