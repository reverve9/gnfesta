/**
 * AR 권한 통합 관리 훅.
 *
 * 중요 (사용자 터치 제약):
 *  - `requestCamera` / `requestGyro` 는 **반드시 사용자 터치(onClick) 핸들러에서 직접 호출**.
 *  - `useEffect` 내부나 Mount 직후 자동 호출 금지 → iOS Safari 가 `NotAllowedError` 반환.
 *  - 권한 상태만 즉시 반영할 목적이면 Mount 시 `navigator.permissions.query()` 로 조회 가능하나,
 *    실제 stream/listener 활성은 반드시 터치 이후.
 *
 * 책임 분리:
 *  - 이 훅은 `CameraStream`/`GyroController` 인스턴스를 **생성·보유·정리**.
 *  - 상위 컴포넌트는 이 훅이 반환한 인스턴스를 `ArScene` 등에 주입.
 *  - 정리는 unmount 시 자동 (dispose 호출).
 *
 * GPS 권한:
 *  - Phase 3 에서 정식 노출. Phase 2 에서는 타입 레벨로 자리만 예약 (`PermissionState` 재사용).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraStream, type CameraStartResult } from '../three/CameraStream'
import { GyroController, type GyroPermissionState } from '../three/GyroController'

export type PermissionState =
  | 'idle'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'not-required'

export interface ArPermissions {
  camera: PermissionState
  gyro: PermissionState
  // gps: Phase 3 에서 추가 예정. 현재는 노출하지 않음.
}

export interface UseArPermissionsApi {
  permissions: ArPermissions
  /** 카메라 권한 요청 + 스트림 취득. **터치 onClick 에서만 호출**. */
  requestCamera: () => Promise<{
    state: PermissionState
    result: CameraStartResult | null
  }>
  /** iOS 자이로 권한 요청 + 리스너 활성화. **터치 onClick 에서만 호출**. */
  requestGyro: () => Promise<PermissionState>
  /** 내부 인스턴스 참조 — ArScene 에 주입하거나 video.srcObject 연결용. */
  cameraStreamRef: React.MutableRefObject<CameraStream | null>
  gyroControllerRef: React.MutableRefObject<GyroController | null>
}

function mapGyroState(s: GyroPermissionState): PermissionState {
  // GyroController 의 'idle' 은 요청 전 상태로 유지.
  return s
}

export function useArPermissions(): UseArPermissionsApi {
  const [permissions, setPermissions] = useState<ArPermissions>({
    camera: 'idle',
    gyro: 'idle',
  })

  const cameraStreamRef = useRef<CameraStream | null>(null)
  const gyroControllerRef = useRef<GyroController | null>(null)

  // 인스턴스 lazy 생성: 훅 최초 Mount 시 딱 한 번.
  // 생성 자체는 side effect 없음 (권한 요청은 request* 메서드에서 발생).
  if (cameraStreamRef.current === null) {
    cameraStreamRef.current = new CameraStream()
  }
  if (gyroControllerRef.current === null) {
    gyroControllerRef.current = new GyroController()
  }

  const requestCamera = useCallback<UseArPermissionsApi['requestCamera']>(async () => {
    const cam = cameraStreamRef.current
    if (!cam || cam.isDisposed) {
      return { state: 'unsupported', result: null }
    }
    setPermissions(p => ({ ...p, camera: 'pending' }))
    const result = await cam.start()
    const state: PermissionState =
      result.status === 'granted'
        ? 'granted'
        : result.status === 'denied'
          ? 'denied'
          : 'unsupported'
    setPermissions(p => ({ ...p, camera: state }))
    return { state, result }
  }, [])

  const requestGyro = useCallback<UseArPermissionsApi['requestGyro']>(async () => {
    const gyro = gyroControllerRef.current
    if (!gyro) return 'unsupported'
    setPermissions(p => ({ ...p, gyro: 'pending' }))
    const result = mapGyroState(await gyro.requestPermission())
    setPermissions(p => ({ ...p, gyro: result }))
    if (result === 'granted' || result === 'not-required') {
      gyro.setEnabled(true)
    }
    return result
  }, [])

  // Unmount 정리 — 훅 소유 인스턴스 해제. 상위가 ArScene 등에서 이미 참조만 사용했으면
  // 아래 dispose 가 리스너·stream 을 닫는다.
  useEffect(() => {
    return () => {
      cameraStreamRef.current?.dispose()
      gyroControllerRef.current?.dispose()
    }
  }, [])

  return {
    permissions,
    requestCamera,
    requestGyro,
    cameraStreamRef,
    gyroControllerRef,
  }
}
