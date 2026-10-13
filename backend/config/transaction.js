// backend/config/transaction.js
const makeWithTransaction = (pool) => async (work) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Не вдалося відкотити транзакцію:', rollbackError);
        }
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = { makeWithTransaction };
