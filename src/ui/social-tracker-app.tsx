import React, { useState, useMemo } from 'react';
import { usePrivosContext, useLists, usePrivosApp, usePrivosTool } from '@privos/app-react';
import { Card, Avatar, Typography, DatePicker, Row, Col, Statistic, List, Space, Tag, Radio, Select, Divider, Segmented } from 'antd';
import { UserOutlined, EyeOutlined, LikeOutlined, CommentOutlined, LinkOutlined, CrownOutlined, ThunderboltOutlined, FacebookOutlined, TwitterOutlined, LinkedinOutlined } from '@ant-design/icons';
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', color: '#1877f2', icon: <FacebookOutlined /> },
  { id: 'x', label: 'X (Twitter)', color: '#000000', icon: <TwitterOutlined /> },
  { id: 'linkedin', label: 'LinkedIn', color: '#0a66c2', icon: <LinkedinOutlined /> }
] as const;

type PlatformId = typeof PLATFORMS[number]['id'];

const MOCK_ACCOUNTS = [
  {
    id: 'stev_builds',
    name: 'Steve AI',
    avatar: 'https://pbs.twimg.com/profile_images/2037485149974306816/OXRyigkg_400x400.jpg',
    platforms: {
      facebook: { username: 'Steve AI', bio: '', followers: 0, totalPosts: 0 },
      x: { username: '@stev_builds', bio: 'Building @PrivOSAI| Enterprise AI suite where teams & agents collaborate | http://travelopen.ai | Agentic Hotel ...', followers: 1500, totalPosts: 320 },
      linkedin: { username: 'in/steve-ai', bio: 'AI Engineer', followers: 800, totalPosts: 45 },
    }
  },
  {
    id: 'privosai',
    name: 'PrivOS',
    avatar: 'https://pbs.twimg.com/profile_images/2013183029779288065/GlhEZQnx_400x400.jpg',
    platforms: {
      facebook: { username: 'PrivOS', bio: 'Facebook page', followers: 0, totalPosts: 0 },
      x: { username: '@PrivOSAI', bio: 'The Intuitive Virtual Workspace Where Teams & AI Agents Collaborate', followers: 29, totalPosts: 5 },
      linkedin: { username: 'in/privos', bio: 'LinkedIn page', followers: 0, totalPosts: 0 },
    }
  }
];

export default function SocialTrackerApp() {
  const ctx = usePrivosContext();

  const { app } = usePrivosApp();
  const [crawledPosts, setCrawledPosts] = React.useState<any[]>([]);

  // 1. Dùng trực tiếp hook usePrivosTool do nền tảng khuyến nghị để an toàn hơn thay vì tự gọi callServerTool
  const { data: resData, loading: isLoading, error: toolErr } = usePrivosTool('privos.lists.getItems', {
    listId: '6a423fc77a0dbb7a6b79a20f',
    roomId: ctx.roomId,
    count: 100
  });

  const dbStatus = React.useMemo(() => {
    if (isLoading) return 'Fetching from privos.lists...';
    if (toolErr) return `Error loading from lists: ${toolErr.message || String(toolErr)}`;
    if (crawledPosts.length > 0) return `Synced ${crawledPosts.length} records directly from privos.lists!`;
    return 'No data found in list';
  }, [isLoading, toolErr, crawledPosts.length]);

  React.useEffect(() => {
    if (!resData) return;

    let rawItems = [];
    if (resData.items) {
      rawItems = resData.items;
    } else if (resData.content && resData.content[0] && resData.content[0].text) {
      try {
        const parsed = JSON.parse(resData.content[0].text);
        if (parsed.items) rawItems = parsed.items;
      } catch (e) { }
    }

    if (rawItems.length > 0) {
      const mapped = rawItems.map((i: any) => {
        const c = i.customFields || {};
        const getVal = (key: string) => Array.isArray(c) ? c.find(f => f.fieldId === key)?.value : c[key];
        return {
          id: getVal('f_id'),
          date: getVal('f_date'),
          views: Number(getVal('f_views') || 0),
          reacts: Number(getVal('f_reacts') || 0),
          comments: Number(getVal('f_comments') || 0),
          summary: i.description || '',
          link: getVal('f_link'),
          rawCustomFields: i.customFields
        };
      });
      
      // Deduplicate posts by ID to prevent React key collision bugs
      const uniquePostsMap = new Map();
      mapped.forEach((p: any) => {
         if (p.id && !uniquePostsMap.has(p.id)) {
            uniquePostsMap.set(p.id, p);
         }
      });
      
      setCrawledPosts(Array.from(uniquePostsMap.values()));
    }
  }, [resData]);

  const [selectedAccId, setSelectedAccId] = useState<string>('privosai');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('x');

  const [viewMode, setViewMode] = useState<'single' | 'range'>('range');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(35, 'day'), dayjs()]);
  const [sortBy, setSortBy] = useState<'date' | 'views' | 'reacts' | 'comments'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const account = MOCK_ACCOUNTS.find(a => a.id === selectedAccId)!;
  const platformData = account.platforms[selectedPlatform];
  const activePlatform = PLATFORMS.find(p => p.id === selectedPlatform)!;

  // Calculate date constraints
  const minDate = dayjs().subtract(35, 'day');
  const maxDate = dayjs();

  const disabledDate = (current: Dayjs) => {
    return current && (current.valueOf() < minDate.startOf('day').valueOf() || current.valueOf() > maxDate.endOf('day').valueOf());
  };

  // Filter posts within date range
  const { filteredPosts, chartData, stats, topPosts, avgViews, engagementRate } = useMemo(() => {
    // Filter by selected account prefix (e.g. 'privosai-x-' or 'stev_builds-x-')
    const prefix = `${selectedAccId}-${selectedPlatform}-`;
    const allPosts = crawledPosts.filter(p => 
      p.id && 
      p.id.startsWith(prefix) &&
      p.link && 
      p.link.toLowerCase().includes(selectedAccId.toLowerCase()) // Loại bỏ các bài Retweet từ tài khoản khác
    );

    if (!dateRange || !dateRange[0] || !dateRange[1]) return { filteredPosts: [], chartData: [], stats: { views: 0, reacts: 0, comments: 0 }, topPosts: [], avgViews: 0, engagementRate: '0.0' };

    const startDate = dateRange[0];
    const endDate = dateRange[1];

    // Filter posts
    const currentPosts = allPosts.filter(p => {
      const pTime = dayjs(p.date).startOf('day').valueOf();
      const sTime = startDate.startOf('day').valueOf();
      const eTime = endDate.startOf('day').valueOf();
      return pTime >= sTime && pTime <= eTime;
    });

    // Sort posts
    currentPosts.sort((a, b) => {
      let valA = a[sortBy] as number | string;
      let valB = b[sortBy] as number | string;
      if (sortBy === 'date') {
        valA = dayjs(a.date).unix();
        valB = dayjs(b.date).unix();
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Calculate aggregated stats
    const totalStats = currentPosts.reduce((acc, curr) => {
      acc.views += curr.views;
      acc.reacts += curr.reacts;
      acc.comments += curr.comments;
      return acc;
    }, { views: 0, reacts: 0, comments: 0 });

    const topPostsList = currentPosts.length > 0 ? [...currentPosts].sort((a, b) => (b.reacts + b.views) - (a.reacts + a.views)).slice(0, 3) : [];
    const avgV = currentPosts.length > 0 ? Math.round(totalStats.views / currentPosts.length) : 0;
    const eRate = totalStats.views > 0 ? ((totalStats.reacts + totalStats.comments) / totalStats.views * 100).toFixed(1) : '0.0';

    // Prepare chart data (group by day)
    const dailyDataMap = new Map();
    const daysDiff = endDate.diff(startDate, 'day');
    for (let i = 0; i <= daysDiff; i++) {
      const d = startDate.add(i, 'day').format('YYYY-MM-DD');
      dailyDataMap.set(d, { date: d, views: 0, reacts: 0, comments: 0 });
    }

    currentPosts.forEach(p => {
      if (dailyDataMap.has(p.date)) {
        const item = dailyDataMap.get(p.date);
        item.views += p.views;
        item.reacts += p.reacts;
        item.comments += p.comments;
      }
    });

    const cData = Array.from(dailyDataMap.values()).sort((a, b) => dayjs(a.date).unix() - dayjs(b.date).unix());

    return { filteredPosts: currentPosts, chartData: cData, stats: totalStats, topPosts: topPostsList, avgViews: avgV, engagementRate: eRate };
  }, [selectedAccId, selectedPlatform, dateRange, sortBy, sortOrder]);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', background: '#f5f7fa', minHeight: '100vh', borderRadius: '8px' }}>
      <Title level={2} style={{ textAlign: 'center', marginBottom: 32, color: '#1890ff' }}>Multi-Platform KPI Tracker</Title>

      {/* 👱‍♀️ ponytail: minimalist privos.lists usage proof without over-engineering */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Space>
          <Tag color="magenta">Mã Room: {ctx.roomId}</Tag>
          <Tag color="green">Dữ liệu: {dbStatus}</Tag>
        </Space>
      </div>

      {/* Header: Platform & Account Switcher */}
      <Card style={{ marginBottom: 24, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} bordered={false}>
        <Row gutter={[24, 24]} align="middle" justify="space-between">
          <Col xs={24} md={12}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text type="secondary" strong>Select Platform:</Text>
              <Segmented
                size="large"
                value={selectedPlatform}
                onChange={(val) => setSelectedPlatform(val as PlatformId)}
                options={PLATFORMS.map(p => ({
                  label: (
                    <div style={{ padding: '4px 8px' }}>
                      <Space>
                        <span style={{ color: p.color }}>{p.icon}</span>
                        <span>{p.label}</span>
                      </Space>
                    </div>
                  ),
                  value: p.id,
                }))}
              />
            </Space>
          </Col>
          <Col xs={24} md={12} style={{ textAlign: 'right' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }} align="end">
              <Text type="secondary" strong>Select Account:</Text>
              <Segmented
                size="large"
                value={selectedAccId}
                onChange={(val) => setSelectedAccId(val as string)}
                options={MOCK_ACCOUNTS.map(a => ({
                  label: (
                    <div style={{ padding: '4px 8px' }}>
                      <Space>
                        <Avatar size="small" src={a.avatar} />
                        <span>{a.name}</span>
                      </Space>
                    </div>
                  ),
                  value: a.id,
                }))}
              />
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: '24px 0' }} />

        <Row gutter={[24, 24]} align="middle">
          <Col xs={24}>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <Avatar size={100} src={account.avatar} style={{ border: `3px solid ${activePlatform.color}` }} />
              <div>
                <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {account.name}
                  <span style={{ color: activePlatform.color, fontSize: 24, display: 'flex', alignItems: 'center' }}>{activePlatform.icon}</span>
                </Title>
                <Text type="secondary" style={{ fontSize: 18 }}>{platformData.username}</Text>
                <Paragraph style={{ margin: '12px 0 0 0', color: '#666', fontSize: 16 }}>{platformData.bio}</Paragraph>
                <Space size="large" style={{ marginTop: 12 }}>
                  <Text strong style={{ fontSize: 16 }}>{platformData.followers.toLocaleString()} <Text type="secondary" strong={false}>Followers</Text></Text>
                  <Text strong style={{ fontSize: 16 }}>{platformData.totalPosts.toLocaleString()} <Text type="secondary" strong={false}>Posts</Text></Text>
                </Space>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Filters & Summary Stats */}
      <Card style={{ marginBottom: 24, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} bordered={false}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Text strong>Timeframe:</Text>
                <Radio.Group value={viewMode} onChange={e => {
                  setViewMode(e.target.value);
                  if (e.target.value === 'single') setDateRange([dayjs(), dayjs()]);
                  else setDateRange([dayjs().subtract(35, 'day'), dayjs()]);
                }}>
                  <Radio.Button value="single">Single Day</Radio.Button>
                  <Radio.Button value="range">Date Range</Radio.Button>
                </Radio.Group>
              </Space>
              {viewMode === 'single' ? (
                <DatePicker
                  value={dateRange[0]}
                  onChange={(val) => val && setDateRange([val, val])}
                  disabledDate={disabledDate}
                  style={{ width: '100%', borderRadius: 6 }}
                  allowClear={false}
                />
              ) : (
                <DatePicker.RangePicker
                  value={dateRange}
                  onChange={(vals) => {
                    if (vals && vals[0] && vals[1]) {
                      let start = vals[0];
                      let end = vals[1];
                      if (end.diff(start, 'day') > 35) {
                        end = start.add(35, 'day');
                      }
                      setDateRange([start, end]);
                    }
                  }}
                  disabledDate={disabledDate}
                  style={{ width: '100%', borderRadius: 6 }}
                  allowClear={false}
                />
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>Allowed: up to 35 days limit.</Text>
            </Space>
          </Col>
          <Col xs={24} md={16}>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: '#fafafa', padding: '20px 0', borderRadius: 12, border: '1px solid #f0f0f0', width: '100%', boxSizing: 'border-box' }}>
              <Statistic title="Total Views" value={stats.views} valueStyle={{ fontSize: 24, fontWeight: 600, color: '#1890ff' }} prefix={<EyeOutlined />} style={{ flex: 1, textAlign: 'center' }} />
              <Divider type="vertical" style={{ height: '50px' }} />
              <Statistic title="Total Reacts" value={stats.reacts} valueStyle={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }} prefix={<LikeOutlined />} style={{ flex: 1, textAlign: 'center' }} />
              <Divider type="vertical" style={{ height: '50px' }} />
              <Statistic title="Total Comments" value={stats.comments} valueStyle={{ fontSize: 24, fontWeight: 600, color: '#faad14' }} prefix={<CommentOutlined />} style={{ flex: 1, textAlign: 'center' }} />
            </div>
          </Col>
        </Row>
      </Card>

      {/* Charts */}
      <Card title={`${activePlatform.label} Engagement`} style={{ marginBottom: 24, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} bordered={false}>
        <div style={{ height: 300, width: '100%' }}>
          <ResponsiveContainer>
            {viewMode === 'single' ? (
              <BarChart data={[
                { name: 'Views', value: stats.views, color: '#1890ff' },
                { name: 'Reacts', value: stats.reacts, color: '#52c41a' },
                { name: 'Comments', value: stats.comments, color: '#faad14' }
              ]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {
                    [
                      { name: 'Views', value: stats.views, color: '#1890ff' },
                      { name: 'Reacts', value: stats.reacts, color: '#52c41a' },
                      { name: 'Comments', value: stats.comments, color: '#faad14' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))
                  }
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReacts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#52c41a" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorComments" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#faad14" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#faad14" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(val) => dayjs(val).format('MMM DD')} />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Area type="monotone" dataKey="views" name="Views" stroke="#1890ff" fillOpacity={1} fill="url(#colorViews)" />
                <Area type="monotone" dataKey="reacts" name="Reacts" stroke="#52c41a" fillOpacity={1} fill="url(#colorReacts)" />
                <Area type="monotone" dataKey="comments" name="Comments" stroke="#faad14" fillOpacity={1} fill="url(#colorComments)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          {/* Post List */}
          <Card
            title="Posts in selected period"
            style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
            bordered={false}
            extra={
              <Space>
                <Text type="secondary">Sort by:</Text>
                <Select value={sortBy} onChange={setSortBy} style={{ width: 120 }}>
                  <Select.Option value="date">Date</Select.Option>
                  <Select.Option value="views">Views</Select.Option>
                  <Select.Option value="reacts">Reacts</Select.Option>
                  <Select.Option value="comments">Comments</Select.Option>
                </Select>
                <Radio.Group value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                  <Radio.Button value="desc">Desc</Radio.Button>
                  <Radio.Button value="asc">Asc</Radio.Button>
                </Radio.Group>
              </Space>
            }
          >
            <List
              itemLayout="vertical"
              dataSource={filteredPosts}
              pagination={{ pageSize: 10, align: 'center' }}
              renderItem={(item) => (
                <List.Item
                  key={item.id}
                  style={{ borderBottom: '1px solid #f0f0f0', padding: '16px 0' }}
                  actions={[
                    <Space key="views"><EyeOutlined /> {item.views}</Space>,
                    <Space key="reacts"><LikeOutlined /> {item.reacts}</Space>,
                    <Space key="comments"><CommentOutlined /> {item.comments}</Space>,
                    <a href={item.link} target="_blank" rel="noreferrer" key="link"><LinkOutlined /> View Original</a>
                  ]}
                >
                  <List.Item.Meta
                    title={<Space><Tag color="blue">{item.date}</Tag></Space>}
                    description={<Text style={{ fontSize: 16, color: '#333' }}>{item.summary}</Text>}
                  />
                </List.Item>
              )}
              locale={{ emptyText: 'No posts found in the selected period.' }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Insights Card */}
            <Card title="Quick Insights" style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} bordered={false}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic title="Avg Views / Post" value={avgViews} prefix={<EyeOutlined />} />
                </Col>
                <Col span={12}>
                  <Statistic title="Engagement Rate" value={engagementRate} suffix="%" prefix={<ThunderboltOutlined style={{ color: '#faad14' }} />} />
                </Col>
              </Row>
            </Card>

            {/* Top Post Card */}
            {topPosts.length > 0 && (
              <Card
                title={<Space><CrownOutlined style={{ color: '#faad14' }} /> Top 3 Posts</Space>}
                style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', background: 'linear-gradient(145deg, #fff9e6, #fff)' }}
                bordered={false}
              >
                {topPosts.map((post, index) => (
                  <div key={post.id} style={{ marginBottom: index !== topPosts.length - 1 ? 16 : 0 }}>
                    <Space style={{ marginBottom: 8 }}>
                      <Tag color={index === 0 ? "gold" : index === 1 ? "silver" : "orange"}>Top {index + 1}</Tag>
                      <Text type="secondary">{post.date}</Text>
                    </Space>
                    <Paragraph strong style={{ fontSize: 14, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.summary}</Paragraph>
                    <Space size="middle" style={{ fontSize: 12 }}>
                      <Text><EyeOutlined /> {post.views}</Text>
                      <Text><LikeOutlined /> {post.reacts}</Text>
                      <Text><CommentOutlined /> {post.comments}</Text>
                      <a href={post.link} target="_blank" rel="noreferrer"><LinkOutlined /></a>
                    </Space>
                    {index !== topPosts.length - 1 && <Divider style={{ margin: '12px 0' }} />}
                  </div>
                ))}
              </Card>
            )}
          </Space>
        </Col>
      </Row>
    </div>
  );
}
