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
  /** `folders.get` の返事のうち、ここで見るぶんだけ（`fields` で絞って取る） */
  interface BoxFolder {
    id: string;
    name: string;
    /** 直上の親。ルート直下なら BOX は `null` を返す */
    parent?: { id: string; name?: string } | null;
    /**
     * **誰が作ったか。** 案件に結び付かないフォルダを消してよいかの判断に使う
     * （**このアプリの実行ユーザーが作ったものだけ**を消す）。
     */
    created_by?: { id: string; login?: string } | null;
  }

  interface BoxClient {
    folders: {
      create(parentId: string, name: string): Promise<{ id: string }>;
      /**
       * 名前の変更と**置き場所の変更**の両方に使う。
       * `parent` を渡すとフォルダごと引っ越す（中身は動かさずIDも変わらない）。
       */
      update(folderId: string, updates: { name?: string; parent?: { id: string } }): Promise<{ id: string }>;
      get(folderId: string, options?: { fields?: string }): Promise<BoxFolder>;
      /**
       * ⚠️ **フォルダを消す。** `recursive` を付けないと中身のあるフォルダは 400 で断られる
       * （それが安全側なので、**この製品では `recursive` を付けない**）。
       * 使ってよいのは `box-lost-cleanup.service.ts` の安全弁を通ったときだけ。
       */
      delete(folderId: string, options?: { recursive?: boolean }): Promise<void>;
      getItems(folderId: string, options?: { limit?: number; offset?: number; fields?: string }): Promise<BoxItemsResponse>;
    };
    /** **アプリ自身が誰か**を知るためだけに使う（`get('me')`） */
    users: {
      get(userId: string, options?: { fields?: string }): Promise<{ id: string; login?: string }>;
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
