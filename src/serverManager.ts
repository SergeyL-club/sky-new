class ServerManager {
  private static instance: ServerManager;

  constructor() {
    if (ServerManager.instance) return ServerManager.instance;
    ServerManager.instance = this;
  }
}

export default new ServerManager();
