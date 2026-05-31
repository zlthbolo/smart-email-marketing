import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Proxy extends Model {
  public id!: string;
  public userId!: string;
  public host!: string;
  public port!: number;
  public protocol!: 'http' | 'https' | 'socks5';
  public username!: string;
  public password!: string;
  public isWorking!: boolean;
  public lastChecked!: Date;
  public assignedToAccountId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Proxy.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    host: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    protocol: {
      type: DataTypes.ENUM('http', 'https', 'socks5'),
      defaultValue: 'http',
    },
    username: {
      type: DataTypes.STRING,
    },
    password: {
      type: DataTypes.STRING,
    },
    isWorking: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastChecked: {
      type: DataTypes.DATE,
    },
    assignedToAccountId: {
      type: DataTypes.UUID,
    },
  },
  {
    sequelize,
    tableName: 'proxies',
    timestamps: true,
  }
);

export default Proxy;
