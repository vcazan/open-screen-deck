import { useCallback, useState } from 'react';
import { ProfileStore, type StoredProfile } from '../utils/profileStore';

export function useProfileStore() {
  const [profiles, setProfiles] = useState<StoredProfile[]>(() => ProfileStore.list());

  const refresh = useCallback(() => {
    setProfiles(ProfileStore.list());
  }, []);

  const save = useCallback(
    (
      name: string,
      data: Parameters<typeof ProfileStore.save>[1],
      extra?: Parameters<typeof ProfileStore.save>[2],
    ) => {
      const profile = ProfileStore.save(name, data, extra);
      refresh();
      return profile;
    },
    [refresh],
  );

  const update = useCallback(
    (
      id: string,
      data: Parameters<typeof ProfileStore.update>[1],
      name?: string,
      extra?: Parameters<typeof ProfileStore.update>[3],
    ) => {
      const profile = ProfileStore.update(id, data, name, extra);
      refresh();
      return profile;
    },
    [refresh],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const existing = ProfileStore.get(id);
      if (!existing) return null;
      const profile = ProfileStore.update(id, existing.data, name);
      refresh();
      return profile;
    },
    [refresh],
  );

  const setAutoApp = useCallback(
    (id: string, autoApp: string) => {
      ProfileStore.setAutoApp(id, autoApp);
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    (id: string) => {
      ProfileStore.remove(id);
      refresh();
    },
    [refresh],
  );

  const importJson = useCallback(
    (json: string) => {
      const count = ProfileStore.importFromJson(json);
      refresh();
      return count;
    },
    [refresh],
  );

  return { profiles, refresh, save, update, rename, setAutoApp, remove, importJson };
}
