declare module 'box-node-sdk' {
  interface BoxClient {
    folders: {
      create(parentId: string, name: string): Promise<{ id: string }>;
      update(folderId: string, updates: { name?: string }): Promise<{ id: string }>;
    };
  }

  interface BoxSdkInstance {
    getAppAuthClient(type: 'enterprise', enterpriseId: string): BoxClient;
  }

  interface BoxSdkStatic {
    getPreconfiguredInstance(config: unknown): BoxSdkInstance;
  }

  const BoxSDK: BoxSdkStatic;
  export default BoxSDK;
}
