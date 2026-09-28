import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { createRuntime } from '../api/runtime';
import { listPresets } from '../sim/scenarios';
import type { Resident, WorldState } from '../sim/types';

const GameCanvas = lazy(() => import('./GameCanvas'));
type Runtime = ReturnType<typeof createRuntime>;

const roleNames: Record<Resident['role'], string> = {
  supply: '生产供应', commerce: '商业服务', care: '医疗照护', maintenance: '维修建设', safety: '公共安全', culture: '行政文化',
};
const activityNames: Record<Resident['activity'], string> = {
  idle: '观察四周', sleep: '休息', eat: '用餐', work: '工作', socialize: '与人来往', relax: '放松', 'seek-care': '寻求照护', commute: '通勤',
};

interface TerrariumAppProps {
  runtime: Runtime;
  renderMap?: boolean;
  initialNotice?: string | null;
}

function formatTime(world: WorldState): string {
  const hour = Math.floor(world.minuteOfDay / 60).toString().padStart(2, '0');
  const minute = (world.minuteOfDay % 60).toString().padStart(2, '0');
  return `第 ${world.day} 天 · ${hour}:${minute}`;
}

export function TerrariumApp({ runtime, renderMap = true, initialNotice = null }: TerrariumAppProps) {
  const [world, setWorld] = useState(() => runtime.getWorldSnapshot());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState(initialNotice);
  const selected = useMemo(() => world.residents.find((resident) => resident.id === selectedId) ?? null, [selectedId, world]);

  const refresh = () => setWorld(runtime.getWorldSnapshot());

  useEffect(() => runtime.subscribeState(setWorld), [runtime]);

  useEffect(() => {
    const handlePersistenceError = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener('terrarium:persistence-error', handlePersistenceError);
    return () => window.removeEventListener('terrarium:persistence-error', handlePersistenceError);
  }, []);

  useEffect(() => {
    if (world.timeScale === 0) return undefined;
    const timer = window.setInterval(() => {
      runtime.advance(runtime.getWorldSnapshot().timeScale);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [runtime, world.timeScale]);

  const changeParameter = (path: 'economy.prosperity' | 'economy.housingPressure' | 'institutions.welfare' | 'technology.automation' | 'culture.socialTrust' | 'environment.pollution', value: number) => {
    void runtime.dispatch({ type: 'update-era-parameter', path, value });
    refresh();
  };

  const changePreset = (id: string) => {
    if (id === 'custom') return;
    void runtime.dispatch({
      type: 'apply-scenario-preset',
      presetId: id as 'stable-modern' | 'economic-downturn' | 'industrial-upgrade' | 'automated-future',
    });
  };

  const updateScenarioMetadata = (name: string, description: string) => {
    void runtime.dispatch({ type: 'update-scenario-metadata', name, description });
    refresh();
  };

  const addOpportunity = () => {
    void runtime.dispatch({
      type: 'create-opportunity',
      opportunity: { name: '社区技能培训计划', target: 'everyone', durationTicks: 96, prosperityBoost: 12 },
    });
    refresh();
  };

  const togglePolicy = () => {
    const current = world.scenario.policies.find((policy) => policy.id === 'rent-relief');
    void runtime.dispatch({
      type: 'upsert-policy',
      policy: {
        id: 'rent-relief', name: '青年租住支持', description: '缓解住房压力，改善可支配收入。',
        enabled: !current?.enabled, intensity: 70, modifiers: [{ path: 'economy.housingPressure', delta: -18 }],
      },
    });
    refresh();
  };

  return (
    <div className="app-shell">
      {notice && <div className="persistence-notice" role="status"><span>{notice}</span><button onClick={() => setNotice(null)}>知道了</button></div>}
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">HUMAN TERRARIUM / 01</span>
          <h1>人间一隅</h1>
          <span className="resident-count">{world.residents.filter((resident) => resident.alive).length} 位居民</span>
        </div>
        <div className="clock-block">
          <span>{formatTime(world)}</span>
          <div className="time-controls" aria-label="时间速度">
            {[0, 1, 2, 4].map((speed) => (
              <button
                className={world.timeScale === speed ? 'active' : ''}
                key={speed}
                onClick={() => { void runtime.dispatch({ type: 'set-time-scale', value: speed as 0 | 1 | 2 | 4 }); refresh(); }}
              >{speed === 0 ? '暂停' : `${speed}×`}</button>
            ))}
          </div>
        </div>
        <div className="metric-strip">
          {Object.entries({ 活力: world.metrics.vitality, 健康: world.metrics.health, 信任: world.metrics.trust, 流动: world.metrics.mobility, 平等: world.metrics.equality, 安全: world.metrics.safety }).map(([name, value]) => (
            <div className="metric" key={name}><span>{name}</span><strong>{value}</strong><i style={{ '--metric': `${value}%` } as React.CSSProperties} /></div>
          ))}
        </div>
      </header>

      <main className="workspace">
        <aside className="panel era-panel" aria-label="时代控制台">
          <div className="panel-heading"><span>01</span><div><p>ERA DIRECTOR</p><h2>时代控制台</h2></div></div>
          <label className="field-label" htmlFor="scenario">时代预设</label>
          <select id="scenario" value={world.scenario.id} onChange={(event) => changePreset(event.target.value)}>
            {world.scenario.id === 'custom' && <option value="custom">自定义时代</option>}
            {listPresets().map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
          </select>
          <p className="scenario-copy">{world.scenario.description}</p>
          {world.scenario.id === 'custom' && (
            <div className="scenario-editor">
              <label>时代名称<input aria-label="自定义时代名称" value={world.scenario.name} onChange={(event) => updateScenarioMetadata(event.target.value, world.scenario.description)} /></label>
              <label>背景说明<textarea aria-label="自定义时代背景" value={world.scenario.description} onChange={(event) => updateScenarioMetadata(world.scenario.name, event.target.value)} /></label>
            </div>
          )}
          <div className="axis-list">
            <EraSlider label="经济景气" value={world.scenario.parameters.economy.prosperity} onChange={(value) => changeParameter('economy.prosperity', value)} />
            <EraSlider label="住房压力" value={world.scenario.parameters.economy.housingPressure} onChange={(value) => changeParameter('economy.housingPressure', value)} />
            <EraSlider label="社会保障" value={world.scenario.parameters.institutions.welfare} onChange={(value) => changeParameter('institutions.welfare', value)} />
            <EraSlider label="自动化" value={world.scenario.parameters.technology.automation} onChange={(value) => changeParameter('technology.automation', value)} />
            <EraSlider label="社会信任" value={world.scenario.parameters.culture.socialTrust} onChange={(value) => changeParameter('culture.socialTrust', value)} />
            <EraSlider label="环境污染" value={world.scenario.parameters.environment.pollution} onChange={(value) => changeParameter('environment.pollution', value)} />
          </div>
          <div className="director-actions">
            <button onClick={togglePolicy}>{world.scenario.policies.some((policy) => policy.id === 'rent-relief' && policy.enabled) ? '停用租住支持' : '启用租住支持'}</button>
            <button onClick={addOpportunity}>投放培训机遇</button>
          </div>
          <div className="active-effects">
            <span>生效中</span>
            <strong>{world.scenario.policies.filter((policy) => policy.enabled).length} 项政策 · {world.scenario.opportunities.length} 个机遇</strong>
          </div>
        </aside>

        <section className="world-column">
          <div className="map-frame">
            <div className="map-chrome"><span>实时社区切片</span><span>拖动平移 · 滚轮缩放 · 点击居民</span></div>
            {renderMap ? (
              <Suspense fallback={<div className="map-placeholder">正在绘制社区…</div>}>
                <GameCanvas world={world} selectedId={selectedId} onSelect={setSelectedId} />
              </Suspense>
            ) : <div className="map-placeholder">社区地图</div>}
            <div className="district-legend">
              {world.districts.map((district) => <span key={district.id}><i style={{ background: `#${district.color.toString(16).padStart(6, '0')}` }} />{district.name}</span>)}
            </div>
          </div>
          <section className="timeline" aria-label="观察时间线">
            <div className="timeline-heading"><div><p>CAUSAL TRACE</p><h2>观察时间线</h2></div><span>保留最近 240 条</span></div>
            <div className="timeline-list">
              {world.events.length === 0 ? <p className="empty-copy">时代尚且平静。调整参数或投放机遇，观察变化如何传到每个人。</p> : world.events.slice(-6).reverse().map((event) => (
                <article key={event.id}><span>{event.type.toUpperCase()}</span><div><strong>{event.title}</strong><p>{event.detail}</p></div><code>{event.causalId ?? `T${event.tick}`}</code></article>
              ))}
            </div>
          </section>
        </section>

        <aside className="panel people-panel">
          <div className="panel-heading"><span>02</span><div><p>RESIDENTS</p><h2>居民观察</h2></div></div>
          <div className="resident-list">
            {world.residents.map((resident) => (
              <button className={selectedId === resident.id ? 'selected' : ''} key={resident.id} onClick={() => setSelectedId(resident.id)}>
                <i style={{ background: resident.color }}>{resident.name.slice(0, 1)}</i>
                <span><strong>{resident.name}</strong><small>{roleNames[resident.role]} · {activityNames[resident.activity]}</small></span>
                <em>{Math.round(resident.needs.health)}</em>
              </button>
            ))}
          </div>
          <ResidentInspector resident={selected} />
        </aside>
      </main>
    </div>
  );
}

function EraSlider({ label, value, onChange }: { label: string; value: number; onChange(value: number): void }) {
  return <label><span>{label}<b>{value}</b></span><input aria-label={label} type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function ResidentInspector({ resident }: { resident: Resident | null }) {
  if (!resident) return <section className="resident-inspector empty" aria-label="居民档案"><span>选择一位居民</span><p>查看他的性格、需求、职责与记忆。</p></section>;
  const traits = [
    ['外向', resident.personality.extraversion], ['尽责', resident.personality.diligence], ['亲和', resident.personality.agreeableness], ['好奇', resident.personality.curiosity], ['抗压', resident.personality.resilience],
  ] as const;
  return (
    <section className="resident-inspector" aria-label="居民档案">
      <div className="portrait" style={{ background: resident.color }}>{resident.name.slice(0, 1)}</div>
      <div><p>{resident.age} 岁 · {roleNames[resident.role]}</p><h2>{resident.name}</h2><span>{resident.traits.join(' / ')}</span></div>
      <h3>当前状态</h3><p className="status-line">{activityNames[resident.activity]} · 健康 {Math.round(resident.needs.health)} · 精力 {Math.round(resident.needs.energy)}</p>
      <h3>性格轮廓</h3>
      <div className="trait-grid">{traits.map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i></div>)}</div>
      <h3>近期记忆</h3><p className="memory">{resident.memories.at(-1)?.text ?? '今天还没有留下特别深刻的记忆。'}</p>
    </section>
  );
}
