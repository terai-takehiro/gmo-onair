declare module 'box-node-sdk' {
  interface BoxItem {
    id: string;
    name: string;
    type: 'folder' | 'file' | string;
    size?: number | string;
    created_at?: string;
  }
  interface BoxItemsResponse {
    entries: BoxItem[];
    total_count?: number;
  }

  interface BoxClient {
    folders: {
      create(parentId: string, name: string): Promise<{ id: string }>;
      update(folderId: string, updates: { name?: string }): Promise<{ id: string }>;
      getItems(folderId: string, options?: { limit?: number; offset?: number; fields?: string }): Promise<BoxItemsResponse>;
    };
    files: {
      get(fileId: string, options?: { fields?: string }): Promise<BoxItem>;
      delete(fileId: string): Promise<void>;
      getReadStream(fileId: string): Promise<NodeJS.ReadableStream>;
      uploadFile(folderId: string, name: string, content: NodeJS.ReadableStream | Buffer | string): Promise<{ entries?: BoxItem[]; id?: string; name?: string }>;
      /** 同じ名前のファイルがあったときに、新しい版として上げ直す */
      uploadFileVersion(fileId: string, name: string, content: NodeJS.ReadableStream | Buffer | string): Promise<{ entries?: BoxItem[]; id?: string; name?: string }>;
    };
  }

  interface BoxSdkInstance {
    getAppAuthClient(type: 'enterprise', enterpriseId?: string): BoxClient;
  }

  interface BoxSdkStatic {
    getPreconfiguredInstance(config: unknown): BoxSdkInstance;
  }

  const BoxSDK: BoxSdkStatic;
  export default BoxSDK;
}
