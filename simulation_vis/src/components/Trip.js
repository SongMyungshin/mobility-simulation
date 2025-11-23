/* global window */
// Trip.js - 택시 이동 경로 + 승객 대기 상황 시각화 컴포넌트

import React, { useState, useEffect, useCallback, useMemo } from "react";

import DeckGL from "@deck.gl/react";
import { Map as ReactMap } from "react-map-gl";

import { AmbientLight, PointLight, LightingEffect } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, ArcLayer } from "@deck.gl/layers";

import Slider from "@mui/material/Slider";
import "../css/trip.css";

/* ------------------------------------------------------------------
 * 1. 조명 / 스타일 설정
 * ------------------------------------------------------------------*/

// 환경광
const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0,
});

// 포인트 라이트
const pointLight = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [-74.05, 40.7, 8000],
});

// 두 조명을 합친 효과
const lightingEffect = new LightingEffect({ ambientLight, pointLight });

// 재질 설정
const material = {
  ambient: 0.1,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [60, 64, 70],
};

const material2 = {
  ambient: 0.3,
  diffuse: 0.6,
  shininess: 32,
  specularCol: [60, 64, 70],
};

const DEFAULT_THEME = {
  buildingColor: [228, 228, 228],
  buildingColor2: [255, 255, 255],
  trailColor0: [253, 128, 93],
  trailColor1: [23, 184, 190],
  material,
  material2,
  effects: [lightingEffect],
};

// 초기 카메라 위치(성남 근처)
const INITIAL_VIEW_STATE = {
  longitude: 127.13,
  latitude: 37.40,
  zoom: 11.5,
  pitch: 30,
  bearing: 0,
};

// 시뮬레이션 시작 시각: 07:00
const minTime = 7 * 60; // 420분
const animationSpeed = 0.5;
const mapStyle = "mapbox://styles/spear5306/ckzcz5m8w002814o2coz02sjc";

// Mapbox 토큰
const MAPBOX_TOKEN =
  "pk.eyJ1Ijoic2hlcnJ5MTAyNCIsImEiOiJjbG00dmtic3YwbGNoM2Zxb3V5NmhxZDZ6In0.ZBrAsHLwNihh7xqTify5hQ";

/* ------------------------------------------------------------------
 * 2. 유틸 함수: 시간 포맷, 색상 매핑
 * ------------------------------------------------------------------*/

// 한 자리 숫자 앞에 0 붙이기
const addZeroFill = (value) => {
  const valueString = value.toString();
  return valueString.length < 2 ? "0" + valueString : valueString;
};

// 시:분 문자열로 변환
const returnAnimationDisplayTime = (time) => {
  const hour = addZeroFill(parseInt((Math.round(time) / 60) % 24));
  const minute = addZeroFill(Math.round(time) % 60);
  return [hour, minute];
};

/*
  대기시간(분)에 따라 색상을 5구간으로 나눔 (흰색 → 진빨강)
*/
const waitToColor = (wait) => {
  const w = Math.max(0, wait || 0);

  if (w < 15) {
    return [255, 255, 255];
  } else if (w < 30) {
    return [255, 230, 230];
  } else if (w < 45) {
    return [255, 190, 190];
  } else if (w < 60) {
    return [255, 140, 140];
  } else {
    return [200, 0, 0];
  }
};

/* ------------------------------------------------------------------
 * 3. 메인 컴포넌트
 * ------------------------------------------------------------------*/

const Trip = (props) => {
  const trip = props.trip;
  const passengers = props.passengers || [];

  // 현재 시각 (분 단위)
  const [time, setTime] = useState(minTime);
  const [animation] = useState({});

  /* ---------------- 데이터 기반 maxTime 계산 ---------------- */

  const dataMaxFromTrips = useMemo(() => {
    if (!trip || trip.length === 0) return 0;
    let maxT = 0;
    for (const t of trip) {
      if (t && t.timestamp && t.timestamp.length) {
        const last = t.timestamp[t.timestamp.length - 1];
        if (typeof last === "number" && last > maxT) maxT = last;
      }
    }
    return maxT;
  }, [trip]);

  const dataMaxFromPassengers = useMemo(() => {
    if (!passengers || passengers.length === 0) return 0;
    let maxT = 0;
    for (const p of passengers) {
      if (p && p.timestamp && p.timestamp.length) {
        const last = p.timestamp[p.timestamp.length - 1];
        if (typeof last === "number" && last > maxT) maxT = last;
      }
    }
    return maxT;
  }, [passengers]);

  // 슬라이더 최대값: 최소 1시간, 데이터 마지막 하차 시각까지
  const maxTime = useMemo(() => {
    const candidate = Math.max(
      minTime + 60,
      dataMaxFromTrips,
      dataMaxFromPassengers
    );
    return Number.isFinite(candidate) && candidate > minTime
      ? candidate
      : minTime + 60;
  }, [dataMaxFromTrips, dataMaxFromPassengers]);

  /* ---------------- 애니메이션 루프 ---------------- */

  const returnAnimationTime = useCallback(
    (t) => {
      if (t > maxTime) {
        return minTime; // 다시 07:00으로
      }
      return t + 0.01 * animationSpeed;
    },
    [maxTime]
  );

  const animate = useCallback(() => {
    setTime((time) => returnAnimationTime(time));
    animation.id = window.requestAnimationFrame(animate);
  }, [animation, returnAnimationTime]);

  useEffect(() => {
    animation.id = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animation.id);
  }, [animation, animate]);

  /* ------------------------------------------------------------------
   * 4. 승객 정보 전처리
   * ------------------------------------------------------------------*/

  const passengerInfos = useMemo(() => {
    if (!passengers || passengers.length === 0) return [];

    // passenger_id -> trip 매핑
    const tripByPid = new Map();
    if (trip && trip.length > 0) {
      for (const t of trip) {
        if (!t) continue;
        const pid = t.passenger_id;
        if (pid === undefined || pid === null) continue;
        if (!tripByPid.has(pid)) tripByPid.set(pid, t);
      }
    }

    const infos = [];

    for (const p of passengers) {
      if (!p) continue;

      const pid = p.passenger_id;
      const t = tripByPid.get(pid);

      const hasTs = Array.isArray(p.timestamp) && p.timestamp.length >= 1;
      const call = hasTs ? p.timestamp[0] : null;

      // 픽업 좌표
      let pickupLoc = null;
      if (Array.isArray(p.loc) && p.loc.length > 0) {
        pickupLoc = p.loc[0];
      } else if (Array.isArray(p.location)) {
        pickupLoc = p.location;
      }

      let pickupTime = null;

      // TRIPS에서 픽업 시각 찾기
      if (t && pickupLoc && Array.isArray(t.route) && Array.isArray(t.timestamp)) {
        const [pxLon, pxLat] = pickupLoc;

        for (let i = 0; i < t.route.length; i++) {
          const pt = t.route[i];
          if (!Array.isArray(pt) || pt.length < 2) continue;

          if (pt[0] === pxLon && pt[1] === pxLat) {
            const tsVal = t.timestamp[i];
            if (typeof tsVal === "number") {
              pickupTime = tsVal;
            }
            break;
          }
        }
      }

      // 없으면 wait_min으로 보완
      if (
        pickupTime == null &&
        typeof call === "number" &&
        typeof p.wait_min === "number"
      ) {
        pickupTime = call + p.wait_min;
      }

      // 그래도 없으면 call과 같다고 가정
      if (pickupTime == null) pickupTime = call;

      infos.push({
        call,
        pickupTime,
        pickupLoc,
      });
    }

    return infos;
  }, [passengers, trip]);

  // 현재 time에서 "아직 픽업 전"인 승객만 표시 + 대기시간 포함
  const visiblePassengers = useMemo(() => {
    const arr = [];
    for (const info of passengerInfos) {
      const { call, pickupTime, pickupLoc } = info;
      if (
        pickupLoc &&
        typeof call === "number" &&
        typeof pickupTime === "number" &&
        time >= call &&
        time <= pickupTime
      ) {
        const wait = pickupTime - call;
        arr.push({
          location: pickupLoc,
          wait,
        });
      }
    }
    return arr;
  }, [passengerInfos, time]);

  /* ------------------------------------------------------------------
   * 5. Deck.gl Layers
   * ------------------------------------------------------------------*/

  const layers = [
    // 택시 이동 경로 (노란 트레일)
    new TripsLayer({
      id: "trips",
      data: trip,
      getPath: (d) => d.route,
      getTimestamps: (d) => d.timestamp,
      getColor: [255, 255, 0],
      opacity: 1,
      widthMinPixels: 7,
      rounded: true,
      capRounded: true,
      jointRounded: true,
      trailLength: 0.5,
      currentTime: time,
      shadowEnabled: false,
    }),

    // 픽업 전 승객 위치: 대기시간에 따라 흰색 → 진빨강
    new ScatterplotLayer({
      id: "passengers",
      data: visiblePassengers,
      getPosition: (d) => d.location,
      getFillColor: (d) => waitToColor(d.wait),
      getRadius: 6,
      radiusUnits: "pixels",
      pickable: true,
      updateTriggers: {
        getPosition: [time],
        getFillColor: [time],
      },
    }),

    // 목적지: 픽업 이후 ~ 하차 전까지 주황색 점
    new ScatterplotLayer({
      id: "destinations",
      data: (() => {
        if (!trip || trip.length === 0) return [];
        const arr = [];
        for (const t of trip) {
          if (
            !t ||
            !t.route ||
            !t.timestamp ||
            t.route.length < 2 ||
            t.timestamp.length < 2
          )
            continue;
          const drop = t.route[t.route.length - 1];
          const pickupTime = t.timestamp[1];
          const end = t.timestamp[t.timestamp.length - 1];
          if (
            typeof pickupTime !== "number" ||
            typeof end !== "number" ||
            time < pickupTime ||
            time > end
          )
            continue;
          arr.push({ location: drop });
        }
        return arr;
      })(),
      getPosition: (d) => d.location,
      getFillColor: [255, 165, 0],
      getRadius: 5,
      radiusUnits: "pixels",
      pickable: false,
      updateTriggers: {
        getPosition: [time],
      },
    }),

    // 배차 직후: 현재 차량 위치 → 픽업 지점까지 "분홍색" 아크 (빈차가 승객에게 가는 중)
    new ArcLayer({
      id: "match-arcs",
      data: (() => {
        if (!trip || trip.length === 0) return [];
        const arcs = [];
        for (const t of trip) {
          if (
            !t ||
            !t.route ||
            !t.timestamp ||
            t.route.length < 2 ||
            t.timestamp.length < 2
          )
            continue;
          const ts = t.timestamp;
          const rt = t.route;
          const start = ts[0];
          const pickupTime = ts[1];
          if (
            typeof start !== "number" ||
            typeof pickupTime !== "number" ||
            time < start ||
            time > pickupTime
          )
            continue;

          // 현재 차량 위치 보간
          let idx = 0;
          for (let k = 0; k < ts.length - 1; k++) {
            if (
              typeof ts[k] === "number" &&
              typeof ts[k + 1] === "number" &&
              ts[k] <= time &&
              time < ts[k + 1]
            ) {
              idx = k;
              break;
            }
            if (time >= ts[ts.length - 1]) idx = ts.length - 2;
          }
          const a = rt[Math.max(0, Math.min(idx, rt.length - 1))];
          const b = rt[Math.max(0, Math.min(idx + 1, rt.length - 1))];
          const t0 = ts[Math.max(0, Math.min(idx, ts.length - 1))];
          const t1 = ts[Math.max(0, Math.min(idx + 1, ts.length - 1))];
          let curr = a;
          if (typeof t0 === "number" && typeof t1 === "number" && t1 > t0) {
            const alpha = Math.max(0, Math.min(1, (time - t0) / (t1 - t0)));
            const x = a[0] + (b[0] - a[0]) * alpha;
            const y = a[1] + (b[1] - a[1]) * alpha;
            curr = [x, y];
          }
          const pickup = rt[1];
          if (Array.isArray(curr) && Array.isArray(pickup)) {
            arcs.push({ source: curr, target: pickup });
          }
        }
        return arcs;
      })(),
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      // 분홍색
      getSourceColor: [255, 105, 180],
      getTargetColor: [255, 105, 180],
      getWidth: 3,
      pickable: false,
      updateTriggers: {
        getSourcePosition: [time],
        getTargetPosition: [time],
      },
    }),

    // 탑승 중: 현재 차량 위치 → 목적지까지 "하늘색" 아크 (실제 이동 중)
    new ArcLayer({
      id: "occupied-arcs",
      data: (() => {
        if (!trip || trip.length === 0) return [];
        const arcs = [];
        for (const t of trip) {
          if (
            !t ||
            !t.route ||
            !t.timestamp ||
            t.route.length < 2 ||
            t.timestamp.length < 2
          )
            continue;
          const ts = t.timestamp;
          const rt = t.route;
          const pickupTime = ts[1];
          const dropTime = ts[ts.length - 1];
          if (
            typeof pickupTime !== "number" ||
            typeof dropTime !== "number" ||
            time < pickupTime ||
            time > dropTime
          )
            continue;

          let idx = 0;
          for (let k = 0; k < ts.length - 1; k++) {
            if (
              typeof ts[k] === "number" &&
              typeof ts[k + 1] === "number" &&
              ts[k] <= time &&
              time < ts[k + 1]
            ) {
              idx = k;
              break;
            }
            if (time >= ts[ts.length - 1]) idx = ts.length - 2;
          }
          const a = rt[Math.max(0, Math.min(idx, rt.length - 1))];
          const b = rt[Math.max(0, Math.min(idx + 1, rt.length - 1))];
          const t0 = ts[Math.max(0, Math.min(idx, ts.length - 1))];
          const t1 = ts[Math.max(0, Math.min(idx + 1, ts.length - 1))];
          let curr = a;
          if (typeof t0 === "number" && typeof t1 === "number" && t1 > t0) {
            const alpha = Math.max(0, Math.min(1, (time - t0) / (t1 - t0)));
            const x = a[0] + (b[0] - a[0]) * alpha;
            const y = a[1] + (b[1] - a[1]) * alpha;
            curr = [x, y];
          }

          const dest = rt[rt.length - 1];
          if (Array.isArray(curr) && Array.isArray(dest)) {
            arcs.push({ source: curr, target: dest });
          }
        }
        return arcs;
      })(),
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      // 하늘색
      getSourceColor: [0, 200, 255],
      getTargetColor: [0, 200, 255],
      getWidth: 1.5,
      pickable: false,
      updateTriggers: {
        getSourcePosition: [time],
        getTargetPosition: [time],
      },
    }),
  ];

  /* ------------------------------------------------------------------
   * 6. 슬라이더 이벤트 / 렌더링
   * ------------------------------------------------------------------*/

  const SliderChange = (e) => {
    const t = Number(e.target.value);
    setTime(t);
  };

  const [hour, minute] = returnAnimationDisplayTime(time);

  return (
    <div className="trip-container" style={{ position: "relative" }}>
      <DeckGL
        effects={DEFAULT_THEME.effects}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
      >
        <ReactMap
          mapStyle={mapStyle}
          mapboxAccessToken={MAPBOX_TOKEN}
          preventStyleDiffing={true}
        />
      </DeckGL>
      <h1 className="time">TIME : {`${hour} : ${minute}`}</h1>
      <Slider
        id="slider"
        value={time}
        min={minTime}
        max={maxTime}
        onChange={SliderChange}
        track="inverted"
      />
    </div>
  );
};

export default Trip;
