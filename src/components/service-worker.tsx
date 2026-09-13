"use client";

import { useEffect } from "react";

/** インストール可能にするために Service Worker を登録する */
export function ServiceWorkerRegistrar() {
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		navigator.serviceWorker.register("/sw.js").catch((err) => {
			console.error("Service Worker の登録に失敗しました", err);
		});
	}, []);

	return null;
}
