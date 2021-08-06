import bunyan from 'bunyan';
import { LOGGING_TRACE_KEY } from '@google-cloud/logging-bunyan';
import cls from 'cls-hooked';
import { v1 as uuid } from 'uuid';

/**
 * CreateLogger will return loggerContextMiddleware and log.
 * Bind the loggerContextMiddleware on top to corelate other middleware logs. `app.use(loggerContextMiddleware);`
 * then you can log like this anywhere `log.info('This is helpful to see correlated logs in nodejs.)` and it will show with-in request log.
 * @param {*} options
 */
export default function createLogger(projectId, bunyanLoggerOptions) {
  if (!projectId || !bunyanLoggerOptions) throw new Error('Please pass the required fields projectId and bunyanLoggerOption');

  const ns = cls.createNamespace(`logger/${uuid()}`); // To create unique namespace.
  const logger = bunyan.createLogger(bunyanLoggerOptions);

  /**
     * Express Middleware to add request context to logger for corelating the logs in GCP.
     * @param {*} req
     * @param {*} res
     * @param {*} next
     */
  const loggerContextMiddleware = (req, res, next) => {
    const traceHeader = (req && req.headers && req.headers['x-cloud-trace-context']) || '';
    if (traceHeader) {
      ns.bindEmitter(req);
      ns.bindEmitter(res);

      const traceId = traceHeader ? traceHeader.split('/')[0] : '';

      const trace = `projects/${projectId}/traces/${traceId}`;

      ns.run(() => {
        ns.set('trace', trace);
        next();
      });
    } else {
      next();
    }
  };

  /**
     * Helper method to get the trace id from CLS hook.
     */
  function getTrace() {
    if (ns && ns.active) return ns.get('trace');
    return '';
  }

  /**
     * Simple wrapper to avoid pushing dev logs to cloud.
     * @param {*} level
     * @param {*} msg
     */
  function printLog(level, ...msg) {
    const trace = getTrace();
    if (trace) { logger[level]({ [LOGGING_TRACE_KEY]: trace }, ...msg); } else { logger[level](...msg); }
  }

  /**
     * Little wrapper to abstract the log level.
     */
  const log = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].reduce((prev, curr) => ({ [curr]: (...msg) => printLog(curr, ...msg), ...prev }), {});

  return { loggerContextMiddleware, log };
}
