/**
 * AR 씬 라이프사이클 통합 훅.
 *
 * 관장 범위:
 *  1. Page Visibility API — hidden 시 scene/camera pause, visible 시 resume
 *  2. 세션 타임아웃 인터페이스만 — Phase 2 에서는 `sessionTimeoutMs` 미지정 → 타이머 비활성
 *     Phase 4 에서 옵션만 넘기면 즉시 동작하도록 구조 완비
 *  3. Unmount 시 `scene.dispose()` 자동 호출 + Visibility 리스너 해제
 *
 * 주의:
 *  - 이 훅은 **권한 요청을 하지 않는다** (iOS NotAllowedError 회피).
 *    카메라/자이로 권한 요청은 반드시 사용자 터치 onClick 에서 `useArPermissions` 의
 *    request 함수를 직접 호출해야 한다.
 *  - scene 인스턴스의 `init()` / `start()` 는 상위 컴포넌트가 주관. 훅은 이미
 *    생성·시작된 scene 에 visibility·수명 관리를 붙여준다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArScene } from '../three/ArScene'
import type { CameraStream } from '../three/CameraStream'

export interface UseArSceneLifecycleOptions {
  /** 이미 init 된 ArScene 인스턴스 참조. 상위가 생성·init 후 설정. */
  sceneRef: React.MutableRefObject<ArScene | null>
  /** 선택: Visibility 시 pause/resume 할 카메라 스트림. */
  cameraStreamRef?: React.MutableRefObject<CameraStream | null>
  /** Phase 4+ 에서 5분 타이머 주입. Phase 2 에서는 미지정. */
  sessionTimeoutMs?: number
  /** 세션 타임아웃 발동 시 호출. Phase 2 에서는 호출되지 않음. */
  onSessionTimeout?: () => void
  /** DEV 모드 추가 로깅. */
  debug?: boolean
}

export interface ArSceneLifecycleApi {
  /** 라우트 이탈 직전 수동 정리. 호출 후 sceneRef 도 null 화 됨. */
  cleanup: () => void
  /** 사용자 터치 시 호출. 세션 타이머가 활성 상태면 재시작. */
  resetSessionTimer: () => void
  /** 현재 Page Visibility 상태. */
  isVisible: boolean
}

function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState !== 'hidden'
}

export function useArSceneLifecycle(
  options: UseArSceneLifecycleOptions,
): ArSceneLifecycleApi {
  const { sceneRef, cameraStreamRef, sessionTimeoutMs, onSessionTimeout, debug } =
    options

  const [isVisible, setIsVisible] = useState<boolean>(isDocumentVisible())
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutCbRef = useRef<(() => void) | undefined>(onSessionTimeout)
  timeoutCbRef.current = onSessionTimeout

  const clearSessionTimer = useCallback(() => {
    if (sessionTimerRef.current !== null) {
      clearTimeout(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
  }, [])

  const resetSessionTimer = useCallback(() => {
    if (!sessionTimeoutMs || sessionTimeoutMs <= 0) return
    clearSessionTimer()
    sessionTimerRef.current = setTimeout(() => {
      if (debug) console.log('[useArSceneLifecycle] session timeout fired')
      timeoutCbRef.current?.()
    }, sessionTimeoutMs)
  }, [sessionTimeoutMs, clearSessionTimer, debug])

  // 세션 타이머: 옵션이 변경될 때만 재시작 (Phase 2 는 미지정 → no-op)
  useEffect(() => {
    if (!sessionTimeoutMs || sessionTimeoutMs <= 0) {
      clearSessionTimer()
      return
    }
    resetSessionTimer()
    return clearSessionTimer
  }, [sessionTimeoutMs, resetSessionTimer, clearSessionTimer])

  // Page Visibility 관리
  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibility = () => {
      const visible = isDocumentVisible()
      setIsVisible(visible)
      const scene = sceneRef.current
      const cam = cameraStreamRef?.current
      if (visible) {
        cam?.resume()
        scene?.resume()
        if (debug) console.log('[useArSceneLifecycle] visible → resume')
      } else {
        scene?.pause()
        cam?.pause()
        if (debug) console.log('[useArSceneLifecycle] hidden → pause')
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    // sceneRef·cameraStreamRef 는 MutableRef 이므로 deps 에 넣지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debug])

  // Unmount 시 scene 자동 정리 — 상위가 별도로 dispose 하지 않은 경우에도 누수 방지
  useEffect(() => {
    return () => {
      clearSessionTimer()
      sceneRef.current?.dispose()
      sceneRef.current = null
      cameraStreamRef?.current?.dispose()
      if (cameraStreamRef) cameraStreamRef.current = null
      if (debug) console.log('[useArSceneLifecycle] unmount dispose')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleanup = useCallback(() => {
    clearSessionTimer()
    sceneRef.current?.dispose()
    sceneRef.current = null
    cameraStreamRef?.current?.dispose()
    if (cameraStreamRef) cameraStreamRef.current = null
    if (debug) console.log('[useArSceneLifecycle] manual cleanup')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSessionTimer, debug])

  return { cleanup, resetSessionTimer, isVisible }
}
