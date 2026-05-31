import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import bcrypt from 'bcryptjs';

class User extends Model {
  public id!: string;
  public email!: string;
  public password!: string;
  public firstName!: string;
  public lastName!: string;
  public country!: string;
  public isVerified!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  async validPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      defaultValue: 'SA',
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    hooks: {
      beforeCreate: async (user: User) => {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      },
    },
  }
);

export default User;
