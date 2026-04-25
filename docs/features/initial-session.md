# initial_session - 导入初始会话

场景级配置，指定一个 session 文件路径，在场景执行前导入该 session。

## 用途

- **延续对话上下文** — 让测试场景能够基于已有的对话历史继续，无需从零开始
- **复用已完成的工作** — 避免重复执行已有的准备步骤
- **调试/测试特定场景** — 从某个特定的对话状态开始测试

## 配置示例

```yaml
scenarios:
  - name: test-feature
    environment: default
    cleanup: true
    initial_session: ".agentut/sessions/base-session.json"
    steps:
      - input: "继续实现功能 X"
        expected:
          - response_contains: "功能 X 已完成"
```

## 注意事项

- 路径相对于 YAML 文件所在目录
- 推荐将 session 文件存放于 `.agentut/sessions/` 目录下
- session 文件需符合 opencode export 格式

## session 文件获取方式

```bash
# 导出已有 session
opencode export ses_xxx > .agentut/sessions/base-session.json
```