// パッチ盤・機材の候補・会社・技術人員（⑤⑥と②③の候補）の取得と編集。
// 契約: `spec/impl-contract.md`「部品の契約」— 関数名はここで固定する
// （`DevicePicker.tsx`・`JackPicker.tsx`・`PersonPicker.tsx`・`TechPanelsPage.tsx`・
// `TechPersonsPage.tsx` がこの名前で読む）。
//
// `persons(params)` と `panelDetail(id)` は**呼ばれた分だけ取りに行く**。
// 描画の途中で通信を始めないよう、要求は `useRef` に控えるだけにして、
// 実際の取得は毎レンダー後の効果が拾う（描画中の setState を作らないため）。
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PatchDeviceOption,
  PatchJack,
  PatchPanelDetail,
  PatchPanelListItem,
  TechCompany,
  TechPerson,
} from "@gmo-onair/shared/src/tech/types";
import * as techApi from "@/lib/techApi";
import { notifyError } from "@/lib/notify";

function personsKey(params: techApi.ListTechPersonsParams): string {
  return [params.company ?? "", params.q ?? "", params.role ?? "", params.include_inactive ?? ""].join("\u0001");
}

export interface UseTechMastersResult {
  panels: PatchPanelListItem[];
  panelsLoading: boolean;
  reloadPanels: () => Promise<void>;
  /** 盤1枚（パッチ番号の一覧つき）。初回は `undefined` を返し、届いたら再描画される */
  panelDetail: (id: string) => PatchPanelDetail | undefined;
  devices: PatchDeviceOption[];
  companies: TechCompany[];
  /** 条件に合う人。初回は空配列を返し、届いたら再描画される */
  persons: (params?: techApi.ListTechPersonsParams) => TechPerson[];
  reloadPersons: () => Promise<void>;
  createPerson: (payload: techApi.TechPersonPayload) => Promise<void>;
  updatePerson: (id: string, patch: techApi.TechPersonPayload) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  createCompany: (payload: techApi.TechCompanyPayload) => Promise<void>;
  updateCompany: (id: string, patch: techApi.TechCompanyPayload) => Promise<void>;
  createPanel: (payload: techApi.CreatePatchPanelPayload) => Promise<void>;
  updatePanel: (id: string, patch: techApi.UpdatePatchPanelPayload) => Promise<void>;
  updateJack: (panelId: string, jackId: string, patch: techApi.UpdatePatchJackPayload) => Promise<void>;
}

export function useTechMasters(): UseTechMastersResult {
  const [panels, setPanels] = useState<PatchPanelListItem[]>([]);
  const [panelsLoading, setPanelsLoading] = useState(true);
  const [devices, setDevices] = useState<PatchDeviceOption[]>([]);
  const [companies, setCompanies] = useState<TechCompany[]>([]);
  const [panelCache, setPanelCache] = useState<Record<string, PatchPanelDetail>>({});
  const [personCache, setPersonCache] = useState<Record<string, TechPerson[]>>({});

  const mountedRef = useRef(true);
  const wantedPanelsRef = useRef<Set<string>>(new Set());
  const wantedPersonsRef = useRef<Map<string, techApi.ListTechPersonsParams>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => () => { mountedRef.current = false; }, []);

  const reloadPanels = useCallback(async () => {
    setPanelsLoading(true);
    try {
      const rows = await techApi.listPatchPanels();
      if (mountedRef.current) setPanels(rows);
    } catch {
      notifyError("パッチ盤を読み込めませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      if (mountedRef.current) setPanelsLoading(false);
    }
  }, []);

  const reloadDevices = useCallback(async () => {
    try {
      const rows = await techApi.listPatchDevices();
      if (mountedRef.current) setDevices(rows);
    } catch {
      notifyError("機材の候補を読み込めませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  }, []);

  const reloadCompanies = useCallback(async () => {
    try {
      const rows = await techApi.listTechCompanies();
      if (mountedRef.current) setCompanies(rows);
    } catch {
      notifyError("会社を読み込めませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  }, []);

  useEffect(() => {
    void reloadPanels();
    void reloadDevices();
    void reloadCompanies();
  }, [reloadPanels, reloadDevices, reloadCompanies]);

  // 要求された盤・人をまとめて取りに行く（毎レンダー後。控えが増えていなければ何もしない）
  useEffect(() => {
    for (const panelId of wantedPanelsRef.current) {
      const key = `panel:${panelId}`;
      if (panelCache[panelId] || inFlightRef.current.has(key)) continue;
      inFlightRef.current.add(key);
      void techApi
        .getPatchPanel(panelId)
        .then((detail) => {
          if (mountedRef.current) setPanelCache((prev) => ({ ...prev, [panelId]: detail }));
        })
        .catch(() => {
          notifyError("パッチ番号を読み込めませんでした。", { description: "少し待ってから、もう一度お試しください。" });
        })
        .finally(() => inFlightRef.current.delete(key));
    }
    for (const [key, params] of wantedPersonsRef.current) {
      const flight = `persons:${key}`;
      if (personCache[key] || inFlightRef.current.has(flight)) continue;
      inFlightRef.current.add(flight);
      void techApi
        .listTechPersons(params)
        .then((rows) => {
          if (mountedRef.current) setPersonCache((prev) => ({ ...prev, [key]: rows }));
        })
        .catch(() => {
          notifyError("技術人員を読み込めませんでした。", { description: "少し待ってから、もう一度お試しください。" });
        })
        .finally(() => inFlightRef.current.delete(flight));
    }
  });

  const panelDetail = useCallback((id: string): PatchPanelDetail | undefined => {
    if (!wantedPanelsRef.current.has(id)) wantedPanelsRef.current.add(id);
    return panelCache[id];
  }, [panelCache]);

  const persons = useCallback((params: techApi.ListTechPersonsParams = {}): TechPerson[] => {
    const key = personsKey(params);
    if (!wantedPersonsRef.current.has(key)) wantedPersonsRef.current.set(key, params);
    return personCache[key] ?? [];
  }, [personCache]);

  const reloadPersons = useCallback(async () => {
    setPersonCache({});
    const entries = [...wantedPersonsRef.current.entries()];
    const pairs = await Promise.all(
      entries.map(async ([key, params]) => {
        try {
          return [key, await techApi.listTechPersons(params)] as const;
        } catch {
          return [key, []] as const;
        }
      }),
    );
    if (!mountedRef.current) return;
    setPersonCache(Object.fromEntries(pairs));
  }, []);

  /** 台帳を書き換えたあとの共通の後始末（失敗は知らせて、読み直して揃える） */
  const runMaster = useCallback(
    async (send: () => Promise<unknown>, after: () => Promise<void>, message: string): Promise<void> => {
      try {
        await send();
      } catch {
        notifyError(message, { description: "少し待ってから、もう一度お試しください。" });
      }
      await after();
    },
    [],
  );

  const createPerson = useCallback(
    (payload: techApi.TechPersonPayload) =>
      runMaster(() => techApi.createTechPerson(payload), async () => {
        await Promise.all([reloadPersons(), reloadCompanies()]);
      }, "人を追加できませんでした。"),
    [runMaster, reloadPersons, reloadCompanies],
  );

  const updatePerson = useCallback(
    (id: string, patch: techApi.TechPersonPayload) =>
      runMaster(() => techApi.updateTechPerson(id, patch), reloadPersons, "人を保存できませんでした。"),
    [runMaster, reloadPersons],
  );

  const deletePerson = useCallback(
    (id: string) =>
      runMaster(() => techApi.deleteTechPerson(id), async () => {
        await Promise.all([reloadPersons(), reloadCompanies()]);
      }, "人を削除できませんでした。"),
    [runMaster, reloadPersons, reloadCompanies],
  );

  const createCompany = useCallback(
    (payload: techApi.TechCompanyPayload) =>
      runMaster(() => techApi.createTechCompany(payload), reloadCompanies, "会社を追加できませんでした。"),
    [runMaster, reloadCompanies],
  );

  const updateCompany = useCallback(
    (id: string, patch: techApi.TechCompanyPayload) =>
      runMaster(() => techApi.updateTechCompany(id, patch), reloadCompanies, "会社を保存できませんでした。"),
    [runMaster, reloadCompanies],
  );

  const createPanel = useCallback(
    (payload: techApi.CreatePatchPanelPayload) =>
      runMaster(() => techApi.createPatchPanel(payload), reloadPanels, "パッチ盤を追加できませんでした。"),
    [runMaster, reloadPanels],
  );

  const updatePanel = useCallback(
    (id: string, patch: techApi.UpdatePatchPanelPayload) =>
      runMaster(() => techApi.updatePatchPanel(id, patch), reloadPanels, "パッチ盤を保存できませんでした。"),
    [runMaster, reloadPanels],
  );

  const updateJack = useCallback(
    async (panelId: string, jackId: string, patch: techApi.UpdatePatchJackPayload): Promise<void> => {
      // 手元の1行だけ先に書き換える（表のセルを打つたびに盤全体を読み直さない）
      setPanelCache((prev) => {
        const detail = prev[panelId];
        if (!detail) return prev;
        return {
          ...prev,
          [panelId]: {
            ...detail,
            jacks: detail.jacks.map((j) => (j.id === jackId ? ({ ...j, ...patch } as PatchJack) : j)),
          },
        };
      });
      try {
        const jack = await techApi.updatePatchJack(panelId, jackId, patch);
        if (!mountedRef.current) return;
        setPanelCache((prev) => {
          const detail = prev[panelId];
          if (!detail) return prev;
          return { ...prev, [panelId]: { ...detail, jacks: detail.jacks.map((j) => (j.id === jackId ? jack : j)) } };
        });
        // 転記の進み（一覧の件数）と機材の候補が変わる
        await Promise.all([reloadPanels(), reloadDevices()]);
      } catch {
        notifyError("パッチ番号を保存できませんでした。", { description: "少し待ってから、もう一度お試しください。最新の内容を読み込み直します。" });
        try {
          const detail = await techApi.getPatchPanel(panelId);
          if (mountedRef.current) setPanelCache((prev) => ({ ...prev, [panelId]: detail }));
        } catch {
          /* 読み直しも失敗したときは、上の知らせだけで止める */
        }
      }
    },
    [reloadPanels, reloadDevices],
  );

  return {
    panels,
    panelsLoading,
    reloadPanels,
    panelDetail,
    devices,
    companies,
    persons,
    reloadPersons,
    createPerson,
    updatePerson,
    deletePerson,
    createCompany,
    updateCompany,
    createPanel,
    updatePanel,
    updateJack,
  };
}

export default useTechMasters;
