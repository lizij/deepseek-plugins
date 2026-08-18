import AppKit
import SwiftUI

/// 余额信息
struct BalanceInfo: Codable {
    let currency: String
    let totalBalance: String
    let grantedBalance: String?
    let toppedUpBalance: String?
}

/// 余额查询结果
struct BalanceResult: Codable {
    let isAvailable: Bool
    let balances: [BalanceInfo]
}

/// 单来源余额查询结果
struct SourceBalanceResult: Codable {
    let source: SourceInfo
    let result: BalanceResult?
    let error: String?

    struct SourceInfo: Codable {
        let id: String
        let name: String
        let type: String
    }
}

/// Token 用量明细项（按 Agent / 按 Model 拆分）
struct TokenBreakdownItem: Codable {
    let name: String
    let tokens: Int

    enum CodingKeys: String, CodingKey {
        case name
        case tokens
    }
}

/// Token 用量汇总（对应 `deepseek-plugin-cli token today --json`）
struct TokenSummary: Codable {
    let today: Int
    let todayInput: Int
    let todayOutput: Int
    let todayCached: Int
    let todayCacheCreation: Int
    let todayReasoning: Int
    let sevenDay: Int
    let allTime: Int
    let updatedAt: String
    let bySource: [TokenBreakdownItem]
    let byModel: [TokenBreakdownItem]

    enum CodingKeys: String, CodingKey {
        case today
        case todayInput = "today_input"
        case todayOutput = "today_output"
        case todayCached = "today_cached"
        case todayCacheCreation = "today_cache_creation"
        case todayReasoning = "today_reasoning"
        case sevenDay = "seven_day"
        case allTime = "all_time"
        case updatedAt = "updated_at"
        case bySource = "by_source"
        case byModel = "by_model"
    }
}

/// 余额状态管理
@MainActor
final class BalanceManager: ObservableObject {
    @Published var balanceText: String = "加载中..."
    @Published var statusText: String = "未知"
    @Published var statusColor: Color = .gray

    private let cliPath: String

    init(cliPath: String) {
        self.cliPath = cliPath
        Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.fetchBalance() }
        }
        fetchBalance()
    }

    /// 调用 deepseek-plugin-cli balance --json 获取余额（后台执行，不阻塞主线程）
    func fetchBalance() {
        let cliPath = self.cliPath
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let task = Process()
            task.launchPath = "/usr/bin/env"
            task.arguments = [cliPath, "balance", "--json"]

            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()

            do {
                try task.run()
                task.waitUntilExit()

                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                guard task.terminationStatus == 0, !data.isEmpty else {
                    DispatchQueue.main.async {
                        self?.balanceText = "查询失败"
                        self?.statusText = "可用状态: 未知"
                        self?.statusColor = .gray
                    }
                    return
                }

                // 尝试解析多来源格式（数组）
                let results = try JSONDecoder().decode([SourceBalanceResult].self, from: data)
                DispatchQueue.main.async {
                    // 取第一个有余额数据的来源展示
                    let valid = results.first { $0.result != nil && !($0.result?.balances.isEmpty ?? true) }
                    if let first = valid, let result = first.result, let main = result.balances.first {
                        self?.balanceText = "\(first.source.name): \(self?.formatBalance(main.totalBalance, currency: main.currency) ?? "")"
                        self?.statusText = "可用状态: \(result.isAvailable ? "✓ 可用" : "⚠ 不可用")"
                        self?.statusColor = result.isAvailable ? .green : .red
                    } else {
                        self?.balanceText = "总额: 无数据"
                        self?.statusText = "可用状态: 未知"
                        self?.statusColor = .gray
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self?.balanceText = "查询失败"
                    self?.statusText = "可用状态: 未知"
                    self?.statusColor = .gray
                }
            }
        }
    }

    private func formatBalance(_ s: String, currency: String) -> String {
        let n = Double(s) ?? 0
        let symbol = currency == "CNY" ? "¥" : currency == "USD" ? "$" : ""
        if n >= 1000 { return "\(symbol)\(String(format: "%.0f", n))" }
        if n >= 10 { return "\(symbol)\(String(format: "%.1f", n))" }
        return "\(symbol)\(String(format: "%.2f", n))"
    }
}

/// Token 用量管理
@MainActor
final class TokenManager: ObservableObject {
    @Published var tokenText: String = "Token: 加载中..."
    @Published var tokenDetail: String = ""
    @Published var bySource: [TokenBreakdownItem] = []
    @Published var byModel: [TokenBreakdownItem] = []

    private let cliPath: String

    init(cliPath: String) {
        self.cliPath = cliPath
        Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.fetchTokens() }
        }
        fetchTokens()
    }

    /// 调用 deepseek-plugin-cli token today --json 获取今日 token 用量（后台执行，不阻塞主线程）
    func fetchTokens() {
        let cliPath = self.cliPath
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            // 先增量扫描 agent 日志，确保本地统计数据最新
            self?.runCLI(arguments: [cliPath, "token", "scan"])

            let task = Process()
            task.launchPath = "/usr/bin/env"
            task.arguments = [cliPath, "token", "today", "--json"]

            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()

            do {
                try task.run()
                task.waitUntilExit()

                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                guard task.terminationStatus == 0, !data.isEmpty else {
                    DispatchQueue.main.async {
                        self?.tokenText = "Token: 无数据"
                        self?.tokenDetail = ""
                        self?.bySource = []
                        self?.byModel = []
                    }
                    return
                }

                let summary = try JSONDecoder().decode(TokenSummary.self, from: data)
                DispatchQueue.main.async {
                    self?.tokenText = "今日 Token: \(formatNumber(summary.today))"
                    var parts: [String] = []
                    parts.append("输入: \(formatNumber(summary.todayInput))")
                    parts.append("输出: \(formatNumber(summary.todayOutput))")
                    parts.append("缓存: \(formatNumber(summary.todayCached))")
                    parts.append("缓存创建: \(formatNumber(summary.todayCacheCreation))")
                    parts.append("推理: \(formatNumber(summary.todayReasoning))")
                    parts.append("近7天: \(formatNumber(summary.sevenDay))")
                    self?.tokenDetail = parts.joined(separator: "  ")
                    self?.bySource = summary.bySource
                    self?.byModel = summary.byModel
                }
            } catch {
                DispatchQueue.main.async {
                    self?.tokenText = "Token: 查询失败"
                    self?.tokenDetail = ""
                    self?.bySource = []
                    self?.byModel = []
                }
            }
        }
    }

    /// 运行 CLI 命令（忽略输出，仅确保执行完成）。不依赖主线程，标记为 nonisolated。
    nonisolated private func runCLI(arguments: [String]) {
        let task = Process()
        task.launchPath = "/usr/bin/env"
        task.arguments = arguments
        task.standardOutput = Pipe()
        task.standardError = Pipe()
        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            // 忽略扫描失败，继续尝试读取
        }
    }
}

/// 数字格式化（K/M）
func formatNumber(_ n: Int) -> String {
    if n >= 1_000_000 { return String(format: "%.2fM", Double(n) / 1_000_000) }
    if n >= 1_000 { return String(format: "%.1fK", Double(n) / 1_000) }
    return String(n)
}

/// DeepSeek 插件菜单栏应用
@main
struct DeepSeekMenuBarApp: App {
    @StateObject private var balanceManager: BalanceManager
    @StateObject private var tokenManager: TokenManager

    init() {
        let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "deepseek-plugin-cli"
        _balanceManager = StateObject(wrappedValue: BalanceManager(cliPath: path))
        _tokenManager = StateObject(wrappedValue: TokenManager(cliPath: path))
    }

    var body: some Scene {
        MenuBarExtra {
            // 余额，点击跳转 usage
            Button {
                if let url = URL(string: "https://platform.deepseek.com/usage") {
                    NSWorkspace.shared.open(url)
                }
            } label: {
                Text(balanceManager.balanceText)
            }

            // 可用状态
            Text(balanceManager.statusText)
                .foregroundStyle(balanceManager.statusColor)

            Divider()

            // Token 用量（第 1 行）：点击展开按 Agent / 按 Model 明细
            Menu {
                if tokenManager.bySource.isEmpty && tokenManager.byModel.isEmpty {
                    Text("暂无明细")
                } else {
                    if !tokenManager.bySource.isEmpty {
                        Menu("按 Agent") {
                            ForEach(tokenManager.bySource, id: \.name) { item in
                                Text("\(item.name): \(formatNumber(item.tokens))")
                            }
                        }
                    }
                    if !tokenManager.byModel.isEmpty {
                        Menu("按 Model") {
                            ForEach(tokenManager.byModel, id: \.name) { item in
                                Text("\(item.name): \(formatNumber(item.tokens))")
                            }
                        }
                    }
                }
            } label: {
                Text(tokenManager.tokenText)
            }

            // Token 明细（输入/输出/缓存/近7天）
            if !tokenManager.tokenDetail.isEmpty {
                Text(tokenManager.tokenDetail)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }

            Divider()

            // 刷新（同时刷新余额和 token）
            Button {
                balanceManager.fetchBalance()
                tokenManager.fetchTokens()
            } label: {
                Label("刷新", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r")

            // 打开图形化配置界面（调用 cli gui，复用/启动后台服务并打开浏览器）
            Button {
                let task = Process()
                task.launchPath = "/usr/bin/env"
                task.arguments = [CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "deepseek-plugin-cli", "gui"]
                task.standardOutput = Pipe()
                task.standardError = Pipe()
                do { try task.run() } catch { /* 忽略 */ }
            } label: {
                Label("打开配置界面", systemImage: "gearshape")
            }

            // 退出
            Button {
                NSApplication.shared.terminate(nil)
            } label: {
                Label("退出", systemImage: "power")
            }
            .keyboardShortcut("q")
        } label: {
            Text("🐳")
        }
    }
}
