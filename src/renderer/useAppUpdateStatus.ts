import { useEffect, useState } from "react";
import type { AppInfo, UpdateStatus } from "../shared/types";

export function useAppUpdateStatus() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      window.openVideoCraft.app.getInfo(),
      window.openVideoCraft.updates.getStatus()
    ])
      .then(([nextAppInfo, nextUpdateStatus]) => {
        if (!mounted) {
          return;
        }

        setAppInfo(nextAppInfo);
        setUpdateStatus(nextUpdateStatus);
      })
      .catch((error) => {
        console.warn("Failed to read app version/update status.", error);
      });

    const dispose = window.openVideoCraft.updates.onStatus((nextStatus) => {
      setUpdateStatus(nextStatus);
    });

    return () => {
      mounted = false;
      dispose();
    };
  }, []);

  async function checkForUpdates() {
    setChecking(true);
    try {
      setUpdateStatus(await window.openVideoCraft.updates.check());
    } catch (error) {
      console.warn("Failed to check for updates.", error);
    } finally {
      setChecking(false);
    }
  }

  async function installUpdate() {
    setInstalling(true);
    try {
      await window.openVideoCraft.updates.install();
    } catch (error) {
      console.warn("Failed to install update.", error);
      setInstalling(false);
    }
  }

  return {
    appInfo,
    updateStatus,
    checking,
    installing,
    checkForUpdates,
    installUpdate
  };
}
