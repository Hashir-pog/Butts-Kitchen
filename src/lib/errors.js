/** An error whose message is safe to show to the person using the site. */
class UserError extends Error {
  constructor(message, { status = 422, fields } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
module.exports = { UserError };
