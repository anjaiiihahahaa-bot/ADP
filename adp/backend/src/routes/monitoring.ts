import { Router, Request, Response } from 'express';
import si from 'systeminformation';
import { query } from '../utils/db';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/v1/monitoring/current
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const [cpuRes, memRes, diskRes, netRes, osRes, procRes, uptimeRes] = await Promise.allSettled([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.osInfo(),
      si.processes(),
      si.time(),
    ]);

    const disk = diskRes.status === 'fulfilled' ? diskRes.value[0] : null;
    const net  = netRes.status  === 'fulfilled' ? netRes.value[0]  : null;

    res.json({
      cpu_usage:  cpuRes.status === 'fulfilled'  ? cpuRes.value.currentLoad  : null,
      load_avg:   cpuRes.status === 'fulfilled'  ? cpuRes.value.cpus?.map((c: { load: number }) => c.load) : null,
      mem_used:   memRes.status === 'fulfilled'  ? memRes.value.used    : null,
      mem_total:  memRes.status === 'fulfilled'  ? memRes.value.total   : null,
      disk_used:  disk ? disk.used  : null,
      disk_total: disk ? disk.size  : null,
      net_rx:     net  ? net.rx_sec : null,
      net_tx:     net  ? net.tx_sec : null,
      uptime:     uptimeRes.status === 'fulfilled' ? uptimeRes.value.uptime : null,
      hostname:   osRes.status === 'fulfilled'   ? osRes.value.hostname  : null,
      os_name:    osRes.status === 'fulfilled'   ? `${osRes.value.distro} ${osRes.value.release}` : null,
      processes:  procRes.status === 'fulfilled'
        ? procRes.value.list
            ?.sort((a: { cpu: number }, b: { cpu: number }) => b.cpu - a.cpu)
            .slice(0, 20)
            .map((p: { pid: number; name: string; cpu: number; mem_rss: number; mem_percent: number }) => ({
              pid: p.pid, name: p.name, cpu: p.cpu, mem: p.mem_percent,
            }))
        : [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Cannot retrieve system metrics' });
  }
});

// GET /api/v1/monitoring/history
router.get('/history', async (req: Request, res: Response) => {
  const from = req.query.from as string;
  const to   = req.query.to   as string;

  let rows;
  if (from && to) {
    rows = await query(
      `SELECT cpu AS cpu_usage, mem_used, mem_total, disk_used, disk_total, net_rx, net_tx, recorded_at AS timestamp
       FROM metric_history WHERE recorded_at BETWEEN $1 AND $2 ORDER BY recorded_at ASC`,
      [from, to]
    );
  } else {
    const hours = Math.min(parseInt((req.query.hours as string) || '24'), 168);
    rows = await query(
      `SELECT cpu AS cpu_usage, mem_used, mem_total, disk_used, disk_total, net_rx, net_tx, recorded_at AS timestamp
       FROM metric_history WHERE recorded_at > NOW() - INTERVAL '${hours} hours' ORDER BY recorded_at ASC`
    );
  }
  res.json(rows);
});

// POST /api/v1/monitoring/record (called by internal cron)
export async function recordMetrics(): Promise<void> {
  try {
    const [cpu, mem, disk, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
    ]);
    const mainDisk = disk[0] || {};
    const mainNet = net[0] || {};
    await query(
      `INSERT INTO metric_history (cpu, mem_used, mem_total, disk_used, disk_total, net_rx, net_tx)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        cpu.currentLoad,
        mem.used, mem.total,
        (mainDisk as Record<string, unknown>).used || 0, (mainDisk as Record<string, unknown>).size || 0,
        (mainNet as Record<string, unknown>).rx_sec || 0, (mainNet as Record<string, unknown>).tx_sec || 0,
      ]
    );
    // Prune old data (keep 7 days)
    await query(`DELETE FROM metric_history WHERE recorded_at < NOW() - INTERVAL '7 days'`);
  } catch { /* non-fatal */ }
}

export default router;
